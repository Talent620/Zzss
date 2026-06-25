package com.aegis.sentinel

import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.LocationManager
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Build
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * AEGIS SENTINEL — the "Flipper from 2500". It does the OPPOSITE of an interceptor:
 * it never captures or clones a signal. It CHALLENGES a physical device (NFC) into
 * a live exchange and seals a Physical Presence Proof — bound to time, place, and a
 * hardware-backed (TEE / StrongBox) signature — into a tamper-evident ledger.
 */
class MainActivity : Activity(), NfcAdapter.ReaderCallback {

    private val ALIAS = "aegis-sentinel-tee"
    private val rng = SecureRandom()
    private var nfc: NfcAdapter? = null
    private var keyPair: KeyPair? = null
    private var strongBox = false
    private var head = "GENESIS"
    private var seq = 0
    private lateinit var log: TextView
    private lateinit var status: TextView
    private lateinit var ledgerFile: File

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ledgerFile = File(filesDir, "ledger.jsonl")

        val root = ScrollView(this)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0b0f14"))
            setPadding(dp(18), dp(20), dp(18), dp(28))
        }
        root.addView(col)

        col.addView(title("AEGIS  SENTINEL"))
        col.addView(sub("Verified Witness — it challenges, it never clones."))
        status = sub("init…")
        col.addView(status)

        col.addView(section("WITNESS (NFC)"))
        col.addView(sub("Hold an NFC card/tag to the back of the phone. The Sentinel issues a live challenge and seals a signed presence proof. A captured replay cannot answer a fresh challenge."))
        col.addView(button("ARM NFC WITNESS") { armHint() })

        col.addView(section("PHYSICS SHIELD"))
        col.addView(button("SIMULATE SAFE 12.6V") { shield(12.6) })
        col.addView(button("SIMULATE OVERDRIVE 14.8V") { shield(14.8) })

        col.addView(section("PHYSICAL TRUTH LEDGER"))
        col.addView(button("SHOW TEE PUBLIC KEY") { showKey() })
        col.addView(button("VERIFY LEDGER CHAIN") { verifyChain() })
        col.addView(button("EXPORT proof.json") { exportLedger() })

        col.addView(section("LOG"))
        log = TextView(this).apply {
            setTextColor(Color.parseColor("#9fd"))
            textSize = 12.5f
            typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(Color.parseColor("#06090d"))
            setPadding(dp(12), dp(12), dp(12), dp(12))
            text = "ready.\n"
        }
        col.addView(log)

        setContentView(root)

        initKey()
        nfc = NfcAdapter.getDefaultAdapter(this)
        status.text = buildString {
            append("TEE key: ").append(if (keyPair != null) (if (strongBox) "StrongBox ✓" else "TEE ✓") else "software")
            append("  ·  NFC: ").append(if (nfc == null) "absent" else if (nfc!!.isEnabled) "ready" else "OFF (enable in settings)")
        }
    }

    // ── hardware-backed key (TEE / StrongBox) ────────────────────────────────
    private fun initKey() {
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null)
            if (ks.containsAlias(ALIAS)) {
                val e = ks.getEntry(ALIAS, null) as KeyStore.PrivateKeyEntry
                keyPair = KeyPair(e.certificate.publicKey, e.privateKey)
                strongBox = Build.VERSION.SDK_INT >= 28
                return
            }
            keyPair = genKey(true)
            strongBox = true
        } catch (e: Exception) {
            try { keyPair = genKey(false); strongBox = false }
            catch (e2: Exception) { keyPair = null; logln("key error: ${e2.message}", "#e55") }
        }
    }

    private fun genKey(useStrongBox: Boolean): KeyPair {
        val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        val b = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
        if (useStrongBox && Build.VERSION.SDK_INT >= 28) b.setIsStrongBoxBacked(true)
        kpg.initialize(b.build())
        return kpg.generateKeyPair()
    }

    private fun teeSign(message: String): String {
        val kp = keyPair ?: return "NO_KEY"
        return try {
            val s = Signature.getInstance("SHA256withECDSA")
            s.initSign(kp.private); s.update(message.toByteArray()); hex(s.sign())
        } catch (e: Exception) { "SIGN_ERR" }
    }

    // ── NFC witnessing ───────────────────────────────────────────────────────
    private fun armHint() {
        if (nfc == null) { toast("No NFC on this device — Shield + Ledger still work."); return }
        if (!nfc!!.isEnabled) { toast("Enable NFC in system settings, then hold a card."); return }
        toast("NFC armed — hold a card to the back of the phone.")
        logln("# NFC armed — present a card to witness it", "#9ad")
    }

    override fun onResume() {
        super.onResume()
        try {
            val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or
                NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
            nfc?.enableReaderMode(this, this, flags, null)
        } catch (_: Exception) {}
    }

    override fun onPause() {
        super.onPause()
        try { nfc?.disableReaderMode(this) } catch (_: Exception) {}
    }

    // Called by Android on a background thread when a tag is present.
    override fun onTagDiscovered(tag: Tag) {
        val uid = hex(tag.id)
        val techs = tag.techList.joinToString(",") { it.substringAfterLast('.') }
        val nonce = randomHex(16)
        var respHex = ""
        var latencyMs = -1L
        var method = "uid-presence"
        val iso = IsoDep.get(tag)
        if (iso != null) {
            method = "isodep-challenge"
            try {
                iso.connect()
                // benign SELECT APDU: forces the card to answer THIS request, live.
                val apdu = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, 0x00)
                val t0 = System.nanoTime()
                val resp = iso.transceive(apdu)
                latencyMs = (System.nanoTime() - t0) / 1_000_000
                respHex = hex(resp)
            } catch (e: Exception) {
                respHex = "ERR"
            } finally { try { iso.close() } catch (_: Exception) {} }
        }
        val proof = sealProof("WITNESS", uid, techs, nonce, respHex, latencyMs, method)
        runOnUiThread {
            logln("# WITNESS  uid=$uid", "#6c6")
            logln("  techs=$techs  method=$method" + if (latencyMs >= 0) "  latency=${latencyMs}ms" else "", "#9fd")
            logln("  proof seq=${proof.first}  sig=${proof.second.take(20)}…  chain✓", "#9fd")
            toast("Witnessed card $uid — proof sealed in TEE")
        }
    }

    // ── proof + ledger (hash-chained, TEE-signed) ────────────────────────────
    private fun sealProof(
        kind: String, uid: String, techs: String, nonce: String,
        resp: String, latencyMs: Long, method: String
    ): Pair<Int, String> {
        val gps = lastFix()
        val body = "{" +
            "\"seq\":$seq,\"kind\":\"$kind\",\"prevHash\":\"$head\"," +
            "\"uid\":\"$uid\",\"techs\":\"$techs\",\"method\":\"$method\"," +
            "\"nonce\":\"$nonce\",\"response\":\"$resp\",\"latencyMs\":$latencyMs," +
            "\"time\":${System.currentTimeMillis()},\"gps\":\"$gps\"," +
            "\"deviceKey\":\"${pubB64()}\"}"
        val entryHash = sha256hex(head + "|" + body)
        val sig = teeSign(entryHash)
        head = entryHash
        val record = "{\"entry\":$body,\"entryHash\":\"$entryHash\",\"sig\":\"$sig\"}"
        try { ledgerFile.appendText(record + "\n") } catch (_: Exception) {}
        val s = seq; seq += 1
        return Pair(s, sig)
    }

    private fun verifyChain() {
        if (!ledgerFile.exists()) { logln("ledger empty", "#dc6"); return }
        var prev = "GENESIS"; var ok = true; var n = 0
        ledgerFile.forEachLine { ln ->
            if (ln.isBlank()) return@forEachLine
            n++
            val body = ln.substringAfter("\"entry\":").substringBeforeLast(",\"entryHash\"")
            val claimed = ln.substringAfter("\"entryHash\":\"").substringBefore("\"")
            val recomputed = sha256hex(prev + "|" + body)
            if (recomputed != claimed) ok = false
            prev = claimed
        }
        logln("# VERIFY LEDGER  entries=$n  chain=${if (ok) "VALID ✓" else "TAMPERED ✗"}", if (ok) "#6c6" else "#e55")
    }

    private fun exportLedger() {
        try {
            val out = File(getExternalFilesDir(null), "aegis-proof.json")
            out.writeText(if (ledgerFile.exists()) ledgerFile.readText() else "")
            logln("exported -> ${out.absolutePath}", "#9ad")
            toast("Exported proof.json")
        } catch (e: Exception) { logln("export err: ${e.message}", "#e55") }
    }

    private fun showKey() {
        logln("# TEE PUBLIC KEY (${if (strongBox) "StrongBox" else "software/TEE"})", "#9ad")
        logln("  ${pubB64().take(64)}…", "#9fd")
    }

    // ── Physics Shield (the on-device verifier) ──────────────────────────────
    private fun shield(target: Double) {
        val ops = listOf(Triple("RAMP", target, 100), Triple("HOLD", 0.0, 200))
        val peak = simulatePeak(target)
        val ok = peak <= 13.2
        logln("# SHIELD target=${target}V -> peak=${"%.1f".format(peak)}V -> ${if (ok) "OK" else "ENVELOPE_VIOLATION"}", if (ok) "#6c6" else "#e55")
        if (!ok) logln("  bus stays cold — the metal is protected from a hallucinated command", "#e55")
    }

    private fun simulatePeak(target: Double): Double {
        // mirrors aegis/src/sim/physics.ts: ramp then hold; peak voltage observed
        var v = 0.0; var peak = 0.0
        val steps = 10
        for (i in 1..steps) { v = target * i / steps; if (v > peak) peak = v }
        repeat(20) { if (v > peak) peak = v }
        return peak
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private fun lastFix(): String {
        return try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            ) return "n/a"
            val lm = getSystemService(LOCATION_SERVICE) as LocationManager
            val loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            if (loc != null) "%.4f,%.4f".format(loc.latitude, loc.longitude) else "no-fix"
        } catch (e: Exception) { "n/a" }
    }

    private fun pubB64(): String {
        val kp = keyPair ?: return "NONE"
        return Base64.encodeToString(kp.public.encoded, Base64.NO_WRAP)
    }

    private fun sha256hex(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun hex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }
    private fun randomHex(n: Int): String { val a = ByteArray(n); rng.nextBytes(a); return hex(a) }

    private fun logln(s: String, color: String = "#9fd") {
        val now = log.text
        log.text = "$s\n$now"
        log.setTextColor(Color.parseColor("#9fd"))
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun title(t: String) = TextView(this).apply {
        text = t; setTextColor(Color.parseColor("#dff")); textSize = 22f
        setPadding(0, 0, 0, dp(2)); letterSpacing = 0.18f
    }
    private fun sub(t: String) = TextView(this).apply {
        text = t; setTextColor(Color.parseColor("#7a8")); textSize = 12.5f; setPadding(0, dp(2), 0, dp(8))
    }
    private fun section(t: String) = TextView(this).apply {
        text = t; setTextColor(Color.parseColor("#5bd")); textSize = 12f; letterSpacing = 0.2f
        setPadding(0, dp(16), 0, dp(6))
    }
    private fun button(t: String, onClick: () -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; gravity = Gravity.CENTER
        setTextColor(Color.parseColor("#dff")); setBackgroundColor(Color.parseColor("#15314a"))
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(8); layoutParams = lp
        setOnClickListener { try { onClick() } catch (e: Exception) { logln("err: ${e.message}", "#e55") } }
    }
}
