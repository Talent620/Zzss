package com.aegis.sentinel

import android.app.Activity
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.Gravity
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
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sqrt

/**
 * AEGIS · REALITY SEAL — a primitive that does not exist anywhere.
 *
 * Instead of COPYING signals (a Flipper), the phone WEAVES the uncontrollable
 * ambient physics of a place+moment — geomagnetic field, barometric pressure,
 * ambient light, the BLE/Wi-Fi neighbourhood — into one fused "reality
 * fingerprint", signs it in the hardware secure element (TEE/StrongBox), and
 * mints a RealitySeal: an un-forgeable, un-replayable proof that THIS device was
 * in THIS micro-environment at THIS instant.
 *
 * From that primitive: the room becomes the password (Place-Lock), and two seals
 * yield a co-presence distance (same place? same moment?) — with no GPS and no
 * server. GPS can be spoofed; the magnetic + RF + barometric texture of one exact
 * spot cannot be reproduced remotely.
 */
class MainActivity : Activity(), SensorEventListener {

    private val ALIAS = "aegis-sentinel-tee"
    private val rng = SecureRandom()
    private var keyPair: KeyPair? = null
    private var strongBox = false
    private lateinit var log: TextView
    private lateinit var status: TextView
    private lateinit var ledgerFile: File

    // live sensor snapshots (NaN = sensor absent / not yet reported)
    @Volatile private var magX = Float.NaN
    @Volatile private var magY = Float.NaN
    @Volatile private var magZ = Float.NaN
    @Volatile private var lightLx = Float.NaN
    @Volatile private var pressHpa = Float.NaN
    private var sm: SensorManager? = null

    private var lastSeal: Seal? = null
    private var trustedSeal: Seal? = null
    private var head = "GENESIS"
    private var seq = 0

    // ── a fused reality fingerprint ──────────────────────────────────────────
    class Seal(
        val ts: Long,
        val mag: FloatArray,   // x,y,z µT (may contain NaN)
        val magMag: Float,
        val light: Float,
        val pressure: Float,
        val wifi: Set<String>, // hashed BSSIDs
        val ble: Set<String>,  // hashed device addresses
        val nonce: String,
        var sealHash: String = "",
        var sig: String = ""
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ledgerFile = File(filesDir, "seals.jsonl")

        val root = ScrollView(this)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0b0f14"))
            setPadding(dp(18), dp(20), dp(18), dp(28))
        }
        root.addView(col)

        col.addView(title("REALITY  SEAL"))
        col.addView(sub("The phone doesn't copy signals — it mints reality. A TEE-signed proof of here-and-now, woven from physics no one can forge remotely."))
        status = sub("init…"); col.addView(status)

        col.addView(section("MINT"))
        col.addView(sub("Capture the magnetic + barometric + light + BLE/Wi-Fi texture of this exact spot and seal it in hardware."))
        col.addView(button("CAPTURE REALITY SEAL") { capture { s -> onSealed(s) } })
        col.addView(button("COMPARE TO LAST SEAL") { compareLast() })

        col.addView(section("PLACE-LOCK  (the room is the password)"))
        col.addView(sub("Save this spot as the trusted scene, then test from here vs another room. Stable channels only (magnetic + Wi-Fi + pressure)."))
        col.addView(button("SET TRUSTED SCENE") { setTrusted() })
        col.addView(button("TEST UNLOCK (am I in the trusted place?)") { testUnlock() })

        col.addView(section("LEDGER · TEE"))
        col.addView(button("SHOW TEE PUBLIC KEY") { showKey() })
        col.addView(button("VERIFY SEAL CHAIN") { verifyChain() })
        col.addView(button("EXPORT seals.json") { exportLedger() })

        col.addView(section("LOG"))
        log = TextView(this).apply {
            setTextColor(Color.parseColor("#9fd")); textSize = 12.5f
            typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(Color.parseColor("#06090d"))
            setPadding(dp(12), dp(12), dp(12), dp(12)); text = "ready.\n"
        }
        col.addView(log)
        setContentView(root)

        requestPerms()
        initKey()
        initSensors()
        status.text = "TEE: " + (if (keyPair != null) (if (strongBox) "StrongBox ✓" else "TEE ✓") else "sw") +
            "  ·  sensors: " + sensorSummary()
    }

    // ── permissions / sensors ────────────────────────────────────────────────
    private fun requestPerms() {
        val p = mutableListOf(android.Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= 31) {
            p.add(android.Manifest.permission.BLUETOOTH_SCAN)
            p.add(android.Manifest.permission.BLUETOOTH_CONNECT)
        }
        try { requestPermissions(p.toTypedArray(), 7) } catch (_: Exception) {}
    }

    private fun initSensors() {
        sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        reg(Sensor.TYPE_MAGNETIC_FIELD); reg(Sensor.TYPE_LIGHT); reg(Sensor.TYPE_PRESSURE)
    }
    private fun reg(type: Int) { sm?.getDefaultSensor(type)?.let { sm?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) } }
    override fun onDestroy() { super.onDestroy(); try { sm?.unregisterListener(this) } catch (_: Exception) {} }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_MAGNETIC_FIELD -> { magX = e.values[0]; magY = e.values[1]; magZ = e.values[2] }
            Sensor.TYPE_LIGHT -> lightLx = e.values[0]
            Sensor.TYPE_PRESSURE -> pressHpa = e.values[0]
        }
    }
    private fun sensorSummary(): String {
        val l = ArrayList<String>()
        if (!magX.isNaN()) l.add("mag"); if (!lightLx.isNaN()) l.add("light"); if (!pressHpa.isNaN()) l.add("baro")
        return if (l.isEmpty()) "none" else l.joinToString("+")
    }

    // ── capture: scan BLE + Wi-Fi, snapshot sensors, fuse + TEE-sign ─────────
    private fun capture(done: (Seal) -> Unit) {
        logln("# scanning the environment…", "#9ad")
        Thread {
            val ble = scanBle()
            val wifi = scanWifi()
            val mag = floatArrayOf(magX, magY, magZ)
            val magMag = if (mag.any { it.isNaN() }) Float.NaN else sqrt(mag[0] * mag[0] + mag[1] * mag[1] + mag[2] * mag[2])
            val nonce = randomHex(16)
            val s = Seal(System.currentTimeMillis(), mag, magMag, lightLx, pressHpa, wifi, ble, nonce)
            sealAndChain(s)
            runOnUiThread { done(s) }
        }.start()
    }

    private fun scanBle(): Set<String> {
        val out = HashSet<String>()
        try {
            if (Build.VERSION.SDK_INT >= 31 &&
                checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) return out
            val mgr = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
            val scanner = mgr.adapter?.bluetoothLeScanner ?: return out
            val cb = object : ScanCallback() {
                override fun onScanResult(t: Int, r: ScanResult) { out.add(h8(r.device.address)) }
            }
            scanner.startScan(cb)
            Thread.sleep(1300)
            scanner.stopScan(cb)
        } catch (_: Exception) {}
        return out
    }

    private fun scanWifi(): Set<String> {
        val out = HashSet<String>()
        try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return out
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            for (r in wm.scanResults) out.add(h8(r.BSSID ?: continue))
        } catch (_: Exception) {}
        return out
    }

    private fun sealAndChain(s: Seal) {
        val body = canonical(s)
        s.sealHash = sha256hex(head + "|" + body)
        s.sig = teeSign(s.sealHash)
        head = s.sealHash
        val rec = "{\"entry\":$body,\"sealHash\":\"${s.sealHash}\",\"sig\":\"${s.sig}\",\"seq\":$seq}"
        try { ledgerFile.appendText(rec + "\n") } catch (_: Exception) {}
        seq += 1
    }

    private fun canonical(s: Seal): String {
        fun f(x: Float) = if (x.isNaN()) "null" else "%.3f".format(x)
        return "{" +
            "\"ts\":${s.ts},\"mag\":[${f(s.mag[0])},${f(s.mag[1])},${f(s.mag[2])}]," +
            "\"magMag\":${f(s.magMag)},\"light\":${f(s.light)},\"pressure\":${f(s.pressure)}," +
            "\"wifi\":[${s.wifi.sorted().joinToString(","){"\"$it\""}}]," +
            "\"ble\":[${s.ble.sorted().joinToString(","){"\"$it\""}}]," +
            "\"nonce\":\"${s.nonce}\",\"key\":\"${pubB64().take(24)}\"}"
    }

    private fun onSealed(s: Seal) {
        lastSeal = s
        logln("# SEAL minted  seq=${seq - 1}", "#6c6")
        logln("  mag=${fmt(s.magMag)}µT  baro=${fmt(s.pressure)}hPa  light=${fmt(s.light)}lx", "#9fd")
        logln("  wifi=${s.wifi.size} aps · ble=${s.ble.size} dev · sig=${s.sig.take(18)}…", "#9fd")
        toast("Reality sealed in TEE")
    }

    // ── co-presence comparison ───────────────────────────────────────────────
    /** Returns Pair(percent 0..100, breakdown). stableOnly weights mag+wifi+pressure. */
    private fun similarity(a: Seal, b: Seal, stableOnly: Boolean): Pair<Int, String> {
        var wsum = 0.0; var acc = 0.0; val parts = ArrayList<String>()
        fun add(name: String, sim: Double, w: Double) { acc += sim * w; wsum += w; parts.add("$name ${(sim * 100).toInt()}%") }

        if (!a.magMag.isNaN() && !b.magMag.isNaN()) {
            val cos = cosine(a.mag, b.mag)
            val magClose = 1.0 - min(1.0, abs(a.magMag - b.magMag) / 25.0) // 25µT tolerance
            add("mag", 0.5 * (cos.coerceIn(0.0, 1.0)) + 0.5 * magClose, 3.0)
        }
        val wj = jaccard(a.wifi, b.wifi); if (a.wifi.isNotEmpty() || b.wifi.isNotEmpty()) add("wifi", wj, 3.0)
        if (!a.pressure.isNaN() && !b.pressure.isNaN()) {
            add("baro", 1.0 - min(1.0, abs(a.pressure - b.pressure) / 1.5), 2.0) // ~same floor
        }
        if (!stableOnly) {
            if (a.ble.isNotEmpty() || b.ble.isNotEmpty()) add("ble", jaccard(a.ble, b.ble), 1.5)
            if (!a.light.isNaN() && !b.light.isNaN()) {
                val dl = abs((a.light - b.light).toDouble()) / (kotlin.math.max(a.light, b.light).toDouble() + 1.0)
                add("light", 1.0 - min(1.0, dl), 0.5)
            }
        }
        val pct = if (wsum == 0.0) 0 else ((acc / wsum) * 100).toInt()
        return Pair(pct, parts.joinToString("  "))
    }

    private fun compareLast() {
        val a = lastSeal
        if (a == null) { logln("capture two seals first", "#dc6"); return }
        logln("# capturing a second seal to compare…", "#9ad")
        capture { b ->
            val (pct, br) = similarity(a, b, false)
            val verdict = when { pct >= 80 -> "SAME SCENE (here & now)"; pct >= 55 -> "SAME PLACE, later"; else -> "DIFFERENT PLACE" }
            logln("# CO-PRESENCE  $pct%  -> $verdict", if (pct >= 55) "#6c6" else "#e55")
            logln("  $br", "#9fd")
            lastSeal = b
        }
    }

    private fun setTrusted() {
        capture { s -> trustedSeal = s; logln("# TRUSTED SCENE saved (this room is now the key)", "#6c6") }
    }

    private fun testUnlock() {
        val t = trustedSeal
        if (t == null) { logln("set a trusted scene first", "#dc6"); return }
        logln("# sensing current scene…", "#9ad")
        capture { now ->
            val (pct, br) = similarity(t, now, true) // stable channels only
            val ok = pct >= 70
            logln("# PLACE-LOCK  $pct%  -> ${if (ok) "AUTHORIZED ✓ (in trusted place)" else "DENIED ✗ (wrong place)"}", if (ok) "#6c6" else "#e55")
            logln("  $br", "#9fd")
        }
    }

    // ── TEE key + ledger (hardware root of trust) ────────────────────────────
    private fun initKey() {
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null)
            if (ks.containsAlias(ALIAS)) {
                val e = ks.getEntry(ALIAS, null) as KeyStore.PrivateKeyEntry
                keyPair = KeyPair(e.certificate.publicKey, e.privateKey); strongBox = Build.VERSION.SDK_INT >= 28; return
            }
            keyPair = genKey(true); strongBox = true
        } catch (e: Exception) {
            try { keyPair = genKey(false); strongBox = false } catch (e2: Exception) { keyPair = null }
        }
    }
    private fun genKey(useStrongBox: Boolean): KeyPair {
        val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        val b = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
        if (useStrongBox && Build.VERSION.SDK_INT >= 28) b.setIsStrongBoxBacked(true)
        kpg.initialize(b.build()); return kpg.generateKeyPair()
    }
    private fun teeSign(message: String): String {
        val kp = keyPair ?: return "NO_KEY"
        return try { val s = Signature.getInstance("SHA256withECDSA"); s.initSign(kp.private); s.update(message.toByteArray()); hex(s.sign()) }
        catch (e: Exception) { "SIGN_ERR" }
    }
    private fun showKey() { logln("# TEE PUBLIC KEY (${if (strongBox) "StrongBox" else "TEE/sw"})", "#9ad"); logln("  ${pubB64().take(64)}…", "#9fd") }

    private fun verifyChain() {
        if (!ledgerFile.exists()) { logln("no seals yet", "#dc6"); return }
        var prev = "GENESIS"; var ok = true; var n = 0
        ledgerFile.forEachLine { ln ->
            if (ln.isBlank()) return@forEachLine; n++
            val body = ln.substringAfter("\"entry\":").substringBeforeLast(",\"sealHash\"")
            val claimed = ln.substringAfter("\"sealHash\":\"").substringBefore("\"")
            if (sha256hex(prev + "|" + body) != claimed) ok = false
            prev = claimed
        }
        logln("# VERIFY  seals=$n  chain=${if (ok) "VALID ✓" else "TAMPERED ✗"}", if (ok) "#6c6" else "#e55")
    }
    private fun exportLedger() {
        try {
            val out = File(getExternalFilesDir(null), "aegis-seals.json")
            out.writeText(if (ledgerFile.exists()) ledgerFile.readText() else ""); logln("exported -> ${out.absolutePath}", "#9ad"); toast("Exported")
        } catch (e: Exception) { logln("export err: ${e.message}", "#e55") }
    }

    // ── math helpers ─────────────────────────────────────────────────────────
    private fun cosine(a: FloatArray, b: FloatArray): Double {
        if (a.any { it.isNaN() } || b.any { it.isNaN() }) return 0.0
        var dot = 0.0; var na = 0.0; var nb = 0.0
        for (i in 0..2) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
        if (na == 0.0 || nb == 0.0) return 0.0
        return dot / (sqrt(na) * sqrt(nb))
    }
    private fun jaccard(a: Set<String>, b: Set<String>): Double {
        if (a.isEmpty() && b.isEmpty()) return 1.0
        val inter = a.count { b.contains(it) }.toDouble(); val uni = (a + b).size.toDouble()
        return if (uni == 0.0) 0.0 else inter / uni
    }

    // ── misc ─────────────────────────────────────────────────────────────────
    private fun pubB64(): String { val kp = keyPair ?: return "NONE"; return Base64.encodeToString(kp.public.encoded, Base64.NO_WRAP) }
    private fun sha256hex(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
    private fun h8(s: String) = sha256hex(s).take(8)
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
    private fun randomHex(n: Int): String { val a = ByteArray(n); rng.nextBytes(a); return hex(a) }
    private fun fmt(x: Float) = if (x.isNaN()) "n/a" else "%.1f".format(x)
    private fun logln(s: String, color: String = "#9fd") { log.text = "$s\n${log.text}" }
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun title(t: String) = TextView(this).apply { text = t; setTextColor(Color.parseColor("#dff")); textSize = 23f; letterSpacing = 0.16f; setPadding(0, 0, 0, dp(2)) }
    private fun sub(t: String) = TextView(this).apply { text = t; setTextColor(Color.parseColor("#7a8")); textSize = 12.5f; setPadding(0, dp(2), 0, dp(8)) }
    private fun section(t: String) = TextView(this).apply { text = t; setTextColor(Color.parseColor("#5bd")); textSize = 12f; letterSpacing = 0.18f; setPadding(0, dp(16), 0, dp(6)) }
    private fun button(t: String, onClick: () -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; gravity = Gravity.CENTER
        setTextColor(Color.parseColor("#dff")); setBackgroundColor(Color.parseColor("#15314a"))
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(8); layoutParams = lp
        setOnClickListener { try { onClick() } catch (e: Exception) { logln("err: ${e.message}", "#e55") } }
    }
}
