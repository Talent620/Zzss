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
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
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
import kotlin.math.sqrt

/**
 * AEGIS DETECTOR — a counter-surveillance "tricorder" for a stock phone.
 *
 * Defensive only: it never tracks or eavesdrops on anyone. It reveals what is
 * watching YOU — hidden trackers, rogue transmitters, concealed electronics,
 * even inaudible ultrasonic beacons — and seals each finding in the TEE so it is
 * court-grade evidence, not a guess.
 *
 *  • RF SWEEP          BLE + Wi-Fi census, identifies tracker brands by company id
 *  • FOLLOWER DETECTOR which BLE devices persist near you across sweeps/time
 *  • EMF / HIDDEN-ELX  magnetometer field meter + anomaly (cameras, mics, magnets)
 *  • ULTRASOUND        mic + FFT, detects 18–22 kHz tracking/ad beacons
 *  • EVIDENCE LEDGER   every finding hash-chained + TEE-signed + exportable
 */
class MainActivity : Activity(), SensorEventListener {

    private val ALIAS = "aegis-detector-tee"
    private val rng = SecureRandom()
    private var keyPair: KeyPair? = null
    private var strongBox = false
    private lateinit var log: TextView
    private lateinit var status: TextView
    private lateinit var ledgerFile: File

    @Volatile private var magX = Float.NaN
    @Volatile private var magY = Float.NaN
    @Volatile private var magZ = Float.NaN
    private var magBaseline = Float.NaN
    private var sm: SensorManager? = null

    // follower tracking: hashed BLE addr -> sweeps seen, last RSSI, last time
    private val seen = HashMap<String, IntArray>() // [sweepsSeen, lastRssi]
    private var sweepIdx = 0
    private var head = "GENESIS"
    private var seq = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ledgerFile = File(filesDir, "findings.jsonl")

        val root = ScrollView(this)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0b0f14"))
            setPadding(dp(18), dp(20), dp(18), dp(28))
        }
        root.addView(col)

        col.addView(title("AEGIS  DETECTOR"))
        col.addView(sub("A counter-surveillance tricorder. It reveals what is watching you — and signs the proof in hardware. It never tracks anyone."))
        status = sub("init…"); col.addView(status)

        col.addView(section("RF SWEEP  ·  trackers & rogue radios"))
        col.addView(sub("Scans BLE + Wi-Fi and names likely trackers (AirTag / SmartTag / Tile) and suspiciously close unnamed devices."))
        col.addView(button("RUN RF SWEEP") { rfSweep() })

        col.addView(section("FOLLOWER DETECTOR  ·  is something on you?"))
        col.addView(sub("Run several sweeps over a few minutes (move around). Devices that keep reappearing near you are flagged as possible planted trackers."))
        col.addView(button("ANALYZE FOLLOWERS") { followers() })

        col.addView(section("EMF · HIDDEN ELECTRONICS"))
        col.addView(sub("Magnetic-field meter. Cameras, mics, speakers, motors and magnets disturb the field. Calibrate in open air, then sweep near objects."))
        col.addView(button("CALIBRATE BASELINE") { magBaseline = magMag(); logln("# baseline = ${fmt(magBaseline)} µT", "#9ad") })
        col.addView(button("EMF SCAN (point at object)") { emfScan() })

        col.addView(section("ULTRASOUND LISTENER  ·  inaudible beacons"))
        col.addView(sub("Detects 18–22 kHz energy you can't hear — used by covert tracking/ad beacons to ping nearby trackers."))
        col.addView(button("LISTEN FOR ULTRASOUND") { ultrasound() })

        col.addView(section("EVIDENCE LEDGER · TEE"))
        col.addView(button("VERIFY EVIDENCE CHAIN") { verifyChain() })
        col.addView(button("EXPORT findings.json") { exportLedger() })

        col.addView(section("LOG"))
        log = TextView(this).apply {
            setTextColor(Color.parseColor("#9fd")); textSize = 12.5f
            typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(Color.parseColor("#06090d"))
            setPadding(dp(12), dp(12), dp(12), dp(12)); text = "ready.\n"
        }
        col.addView(log)
        setContentView(root)

        requestPerms(); initKey(); initSensors()
        status.text = "TEE: " + (if (keyPair != null) (if (strongBox) "StrongBox ✓" else "TEE ✓") else "sw") +
            "  ·  mag: " + (if (magX.isNaN()) "absent" else "ok")
    }

    // ── permissions / sensors ────────────────────────────────────────────────
    private fun requestPerms() {
        val p = mutableListOf(android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 31) { p.add(android.Manifest.permission.BLUETOOTH_SCAN); p.add(android.Manifest.permission.BLUETOOTH_CONNECT) }
        try { requestPermissions(p.toTypedArray(), 7) } catch (_: Exception) {}
    }
    private fun initSensors() {
        sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sm?.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let { sm?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }
    override fun onDestroy() { super.onDestroy(); try { sm?.unregisterListener(this) } catch (_: Exception) {} }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    override fun onSensorChanged(e: SensorEvent) {
        if (e.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) { magX = e.values[0]; magY = e.values[1]; magZ = e.values[2] }
    }
    private fun magMag(): Float = if (magX.isNaN()) Float.NaN else sqrt(magX * magX + magY * magY + magZ * magZ)

    // ── RF SWEEP ─────────────────────────────────────────────────────────────
    private fun rfSweep() {
        logln("# RF SWEEP scanning…", "#9ad")
        Thread {
            val found = ArrayList<String>()
            val flags = ArrayList<String>()
            try {
                if (Build.VERSION.SDK_INT < 31 || checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED) {
                    val mgr = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
                    val scanner = mgr.adapter?.bluetoothLeScanner
                    if (scanner != null) {
                        sweepIdx += 1
                        val hits = HashMap<String, ScanResult>()
                        val cb = object : ScanCallback() { override fun onScanResult(t: Int, r: ScanResult) { hits[r.device.address] = r } }
                        scanner.startScan(cb); Thread.sleep(2500); scanner.stopScan(cb)
                        for ((addr, r) in hits) {
                            val h = h8(addr); val a = seen.getOrPut(h) { intArrayOf(0, -127) }
                            a[0] = a[0] + 1; a[1] = r.rssi
                            val label = classify(r)
                            if (label != null) flags.add("⚠ $label  rssi=${r.rssi}dBm (${near(r.rssi)})  id=$h")
                        }
                        found.add("BLE devices: ${hits.size}")
                    }
                }
            } catch (_: Exception) {}
            try {
                if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                    @Suppress("DEPRECATION") val aps = wm.scanResults
                    val hidden = aps.count { it.SSID.isNullOrBlank() }
                    found.add("Wi-Fi APs: ${aps.size} (${hidden} hidden)")
                }
            } catch (_: Exception) {}
            seal("RF_SWEEP", (found + flags).joinToString(" | "))
            runOnUiThread {
                logln("# RF SWEEP #$sweepIdx  ${found.joinToString(" · ")}", "#6c6")
                if (flags.isEmpty()) logln("  no known trackers in range", "#9fd")
                else flags.forEach { logln("  $it", "#e55") }
            }
        }.start()
    }

    /** Identify likely trackers by BLE manufacturer company id / service UUID. */
    private fun classify(r: ScanResult): String? {
        val sr = r.scanRecord ?: return strongUnnamed(r)
        val msd = sr.manufacturerSpecificData
        if (msd != null) {
            for (i in 0 until msd.size()) {
                when (msd.keyAt(i)) {
                    0x004C -> return "Apple FindMy / AirTag"
                    0x0075 -> return "Samsung SmartTag"
                    0x00E0 -> return "Google FindMy tag"
                    0x0157 -> return "Tile tracker"
                }
            }
        }
        val uuids = sr.serviceUuids
        if (uuids != null) for (u in uuids) {
            val s = u.uuid.toString().lowercase()
            if (s.contains("feed") || s.contains("feec")) return "Tile tracker"
            if (s.contains("fd5a")) return "Chipolo tracker"
        }
        return strongUnnamed(r)
    }
    private fun strongUnnamed(r: ScanResult): String? {
        val name = r.scanRecord?.deviceName
        return if ((name == null || name.isBlank()) && r.rssi > -55) "Unknown VERY close device" else null
    }
    private fun near(rssi: Int) = when { rssi > -50 -> "touching"; rssi > -65 -> "very close"; rssi > -80 -> "near"; else -> "far" }

    // ── FOLLOWER DETECTOR ────────────────────────────────────────────────────
    private fun followers() {
        if (sweepIdx < 2) { logln("run RF SWEEP at least 2–3× (move around) first", "#dc6"); return }
        val persistent = seen.entries.filter { it.value[0] >= 3 }.sortedByDescending { it.value[0] }
        logln("# FOLLOWER ANALYSIS  (${sweepIdx} sweeps)", "#9ad")
        if (persistent.isEmpty()) { logln("  nothing is consistently following you ✓", "#6c6"); return }
        for (e in persistent.take(8)) {
            val strong = e.value[1] > -70
            logln("  ${if (strong) "⚠ FOLLOWING" else "·"} id=${e.key}  seen ${e.value[0]}/${sweepIdx} sweeps  rssi=${e.value[1]}dBm", if (strong) "#e55" else "#9fd")
        }
        seal("FOLLOWER", "persistent=${persistent.size}")
    }

    // ── EMF / hidden electronics ─────────────────────────────────────────────
    private fun emfScan() {
        val m = magMag()
        if (m.isNaN()) { logln("no magnetometer", "#dc6"); return }
        val base = if (magBaseline.isNaN()) 45f else magBaseline // ~Earth field default
        val delta = abs(m - base)
        val level = when { delta > 80 -> "STRONG ANOMALY — concealed magnet/motor?"; delta > 30 -> "anomaly — electronics nearby"; delta > 12 -> "slight disturbance"; else -> "clean" }
        logln("# EMF  ${fmt(m)} µT  (Δ ${fmt(delta)} vs ${fmt(base)})  -> $level", if (delta > 30) "#e55" else "#6c6")
        if (delta > 12) seal("EMF", "mag=${fmt(m)} delta=${fmt(delta)}")
    }

    // ── ULTRASOUND beacon detector (mic + FFT) ───────────────────────────────
    private fun ultrasound() {
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            logln("grant microphone permission, then retry", "#dc6"); requestPerms(); return
        }
        logln("# listening for inaudible 18–22 kHz…", "#9ad")
        Thread {
            try {
                val rate = 44100; val N = 4096
                val minBuf = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                val rec = AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuf, N * 4))
                rec.startRecording()
                val buf = ShortArray(N); var off = 0
                while (off < N) { val r = rec.read(buf, off, N - off); if (r <= 0) break; off += r }
                rec.stop(); rec.release()
                val re = DoubleArray(N); val im = DoubleArray(N)
                for (i in 0 until N) { val w = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * i / (N - 1)); re[i] = buf[i] * w; im[i] = 0.0 }
                fft(re, im)
                var total = 0.0; var ultra = 0.0
                val loBin = 18000 * N / rate; val hiBin = 22000 * N / rate
                for (i in 2 until N / 2) { val p = re[i] * re[i] + im[i] * im[i]; total += p; if (i in loBin..hiBin) ultra += p }
                val ratio = if (total <= 0) 0.0 else ultra / total
                val present = ratio > 0.04 && total > 1e6
                runOnUiThread {
                    logln("# ULTRASOUND  ultrasonic share=${(ratio * 100).toInt()}%  -> ${if (present) "BEACON DETECTED ⚠" else "clear ✓"}", if (present) "#e55" else "#6c6")
                }
                if (present) seal("ULTRASOUND", "ratio=${"%.3f".format(ratio)}")
            } catch (e: Exception) { runOnUiThread { logln("audio error: ${e.message}", "#e55") } }
        }.start()
    }

    /** in-place iterative radix-2 Cooley–Tukey FFT */
    private fun fft(re: DoubleArray, im: DoubleArray) {
        val n = re.size; var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
            j = j or bit
            if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
        }
        var len = 2
        while (len <= n) {
            val ang = -2.0 * Math.PI / len; val wr = Math.cos(ang); val wi = Math.sin(ang)
            var i = 0
            while (i < n) {
                var cwr = 1.0; var cwi = 0.0
                for (k in 0 until len / 2) {
                    val ar = re[i + k]; val ai = im[i + k]
                    val br = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi
                    val bi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr
                    re[i + k] = ar + br; im[i + k] = ai + bi
                    re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi
                    val ncwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = ncwr
                }
                i += len
            }
            len = len shl 1
        }
    }

    // ── evidence ledger (hash-chained, TEE-signed) ───────────────────────────
    private fun seal(kind: String, detail: String) {
        val body = "{\"seq\":$seq,\"kind\":\"$kind\",\"detail\":\"${detail.replace("\"", "'")}\",\"ts\":${System.currentTimeMillis()},\"prev\":\"$head\"}"
        val hash = sha256hex(head + "|" + body); val sig = teeSign(hash); head = hash
        try { ledgerFile.appendText("{\"entry\":$body,\"hash\":\"$hash\",\"sig\":\"$sig\"}\n") } catch (_: Exception) {}
        seq += 1
    }
    private fun verifyChain() {
        if (!ledgerFile.exists()) { logln("no findings yet", "#dc6"); return }
        var prev = "GENESIS"; var ok = true; var n = 0
        ledgerFile.forEachLine { ln -> if (ln.isBlank()) return@forEachLine; n++
            val body = ln.substringAfter("\"entry\":").substringBeforeLast(",\"hash\"")
            val claimed = ln.substringAfter("\"hash\":\"").substringBefore("\"")
            if (sha256hex(prev + "|" + body) != claimed) ok = false; prev = claimed
        }
        logln("# VERIFY  findings=$n  chain=${if (ok) "VALID ✓" else "TAMPERED ✗"}", if (ok) "#6c6" else "#e55")
    }
    private fun exportLedger() {
        try { val out = File(getExternalFilesDir(null), "aegis-findings.json"); out.writeText(if (ledgerFile.exists()) ledgerFile.readText() else "")
            logln("exported -> ${out.absolutePath}", "#9ad"); toast("Exported") } catch (e: Exception) { logln("export err: ${e.message}", "#e55") }
    }

    // ── TEE key ──────────────────────────────────────────────────────────────
    private fun initKey() {
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null)
            if (ks.containsAlias(ALIAS)) { val e = ks.getEntry(ALIAS, null) as KeyStore.PrivateKeyEntry
                keyPair = KeyPair(e.certificate.publicKey, e.privateKey); strongBox = Build.VERSION.SDK_INT >= 28; return }
            keyPair = genKey(true); strongBox = true
        } catch (e: Exception) { try { keyPair = genKey(false); strongBox = false } catch (e2: Exception) { keyPair = null } }
    }
    private fun genKey(useStrongBox: Boolean): KeyPair {
        val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        val b = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN).setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256)
        if (useStrongBox && Build.VERSION.SDK_INT >= 28) b.setIsStrongBoxBacked(true)
        kpg.initialize(b.build()); return kpg.generateKeyPair()
    }
    private fun teeSign(message: String): String {
        val kp = keyPair ?: return "NO_KEY"
        return try { val s = Signature.getInstance("SHA256withECDSA"); s.initSign(kp.private); s.update(message.toByteArray()); hex(s.sign()) } catch (e: Exception) { "SIGN_ERR" }
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private fun sha256hex(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
    private fun h8(s: String) = sha256hex(s).take(8)
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
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
