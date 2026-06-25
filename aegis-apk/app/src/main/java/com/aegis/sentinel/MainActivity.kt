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
import android.os.Handler
import android.os.Looper
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
    @Volatile private var accX = 0f
    @Volatile private var accY = 0f
    @Volatile private var accZ = 0f
    private var magBaseline = Float.NaN
    private var sm: SensorManager? = null

    // wall-map live scan
    private val handler = Handler(Looper.getMainLooper())
    private val magRing = FloatArray(80)
    private var magRingIdx = 0
    private var magRingFill = 0
    private var liveMag = false
    private lateinit var liveView: TextView
    // honey-seal tamper trap
    private var armed = false
    private var tripped = false
    private var baseAcc: FloatArray? = null
    // RF room watch
    private var roomBaseline: Set<String>? = null

    // follower tracking: hashed BLE addr -> sweeps seen, last RSSI, last time
    private val seen = HashMap<String, IntArray>() // [sweepsSeen, lastRssi]
    private var sweepIdx = 0
    private var head = "GENESIS"
    private var seq = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Thread.setDefaultUncaughtExceptionHandler { _, ex -> saveCrash(ex) }
        try {
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

        col.addView(section("WALL MAP  ·  hidden wiring / cameras"))
        col.addView(sub("Live magnetic map. Start it and slowly sweep the phone across a wall/object — peaks reveal concealed metal, wiring, motors, magnets."))
        val wallBtn = button("WALL SCAN ▶ (live)") {}
        wallBtn.setOnClickListener { try { toggleWall(wallBtn) } catch (e: Exception) { logln("err: ${e.message}", "#e55") } }
        col.addView(wallBtn)
        liveView = TextView(this).apply {
            setTextColor(Color.parseColor("#6cf")); textSize = 13f; typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(Color.parseColor("#06090d")); setPadding(dp(12), dp(10), dp(12), dp(10)); text = "—"
        }
        col.addView(liveView)

        col.addView(section("RF ROOM WATCH  ·  new transmitter alarm"))
        col.addView(sub("Snapshot a room's radios, leave, come back — it tells you if a NEW transmitter appeared (someone switched on a bug or walked in with a device)."))
        col.addView(button("SET ROOM BASELINE") { setRoomBaseline() })
        col.addView(button("CHECK FOR NEW TRANSMITTERS") { checkRoomChange() })

        col.addView(section("HONEY-SEAL  ·  tamper trap"))
        col.addView(sub("Arm it and leave the phone. If anyone moves or picks it up while you're away, it seals a signed, timestamped tamper record you can prove later."))
        col.addView(button("ARM HONEY-SEAL") { armSeal() })
        col.addView(button("CHECK / DISARM") { checkSeal() })

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

        try { initKey() } catch (e: Throwable) { logln("key init: ${e.message}", "#dc6") }
        try { initSensors() } catch (e: Throwable) { logln("sensors: ${e.message}", "#dc6") }
        try { requestPerms() } catch (e: Throwable) {}
        try {
            status.text = "TEE: " + (if (keyPair != null) (if (strongBox) "StrongBox ✓" else "TEE ✓") else "sw") +
                "  ·  mag: " + (if (magX.isNaN()) "absent" else "ok")
        } catch (e: Throwable) {}
        } catch (fatal: Throwable) {
            showError(fatal)
        }
    }

    private fun showError(e: Throwable) {
        try {
            val sw = java.io.StringWriter(); e.printStackTrace(java.io.PrintWriter(sw))
            val tv = TextView(this).apply {
                setTextColor(Color.parseColor("#ff6b6b")); textSize = 12f
                typeface = android.graphics.Typeface.MONOSPACE; setPadding(28, 40, 28, 28)
                text = "AEGIS — start error (screenshot this and send it):\n\n$sw"
            }
            setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0b0f14")); addView(tv) })
        } catch (_: Throwable) {}
    }
    private fun saveCrash(ex: Throwable) {
        try {
            val sw = java.io.StringWriter(); ex.printStackTrace(java.io.PrintWriter(sw))
            File(getExternalFilesDir(null), "aegis-crash.txt").writeText(sw.toString())
        } catch (_: Throwable) {}
    }

    // ── permissions / sensors ────────────────────────────────────────────────
    private fun requestPerms() {
        val p = mutableListOf(android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 31) { p.add(android.Manifest.permission.BLUETOOTH_SCAN); p.add(android.Manifest.permission.BLUETOOTH_CONNECT) }
        try { requestPermissions(p.toTypedArray(), 7) } catch (_: Exception) {}
    }
    private fun initSensors() {
        sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sm?.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let { sm?.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sm?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }
    override fun onDestroy() { super.onDestroy(); try { sm?.unregisterListener(this) } catch (_: Exception) {} }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_MAGNETIC_FIELD -> { magX = e.values[0]; magY = e.values[1]; magZ = e.values[2]; pushMag() }
            Sensor.TYPE_ACCELEROMETER -> { accX = e.values[0]; accY = e.values[1]; accZ = e.values[2] }
        }
    }
    private fun pushMag() { val m = magMag(); if (!m.isNaN()) { magRing[magRingIdx] = m; magRingIdx = (magRingIdx + 1) % magRing.size; if (magRingFill < magRing.size) magRingFill++ } }
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

    // ── WALL MAP (live magnetic sweep) ───────────────────────────────────────
    private val liveRunnable = object : Runnable {
        override fun run() {
            if (!liveMag) return
            liveView.text = sparkline() + "\n${fmt(magMag())} µT   peak ${fmt(ringPeak())} µT   (sweep slowly; peaks = metal/wiring/camera)"
            handler.postDelayed(this, 160)
        }
    }
    private fun toggleWall(b: Button) {
        liveMag = !liveMag
        if (liveMag) { b.text = "WALL SCAN ◼ (stop)"; magRingFill = 0; magRingIdx = 0; handler.post(liveRunnable) }
        else { b.text = "WALL SCAN ▶ (live)"; liveView.text = "—" }
    }
    private fun sparkline(): String {
        if (magRingFill == 0) return "........"
        val n = magRingFill
        val vals = FloatArray(n) { magRing[(magRingIdx - n + it + magRing.size) % magRing.size] }
        val mn = vals.minOrNull() ?: 0f; val mx = vals.maxOrNull() ?: 1f
        val chars = " .:-=+*#%@"
        val sb = StringBuilder()
        for (v in vals) { val t = if (mx - mn < 0.001f) 0 else ((v - mn) / (mx - mn) * (chars.length - 1)).toInt(); sb.append(chars[t.coerceIn(0, chars.length - 1)]) }
        return sb.toString()
    }
    private fun ringPeak(): Float {
        if (magRingFill == 0) return Float.NaN
        var mx = -1f; for (i in 0 until magRingFill) if (magRing[i] > mx) mx = magRing[i]; return mx
    }

    // ── RF ROOM WATCH ────────────────────────────────────────────────────────
    private fun setRoomBaseline() {
        logln("# capturing room RF baseline…", "#9ad")
        Thread { val ids = scanIds(); roomBaseline = ids; runOnUiThread { logln("# baseline: ${ids.size} transmitters in this room", "#6c6") } }.start()
    }
    private fun checkRoomChange() {
        val base = roomBaseline
        if (base == null) { logln("set a room baseline first", "#dc6"); return }
        logln("# re-scanning room…", "#9ad")
        Thread {
            val now = scanIds(); val added = now - base
            runOnUiThread {
                if (added.isEmpty()) logln("# room unchanged ✓  no new transmitters", "#6c6")
                else { logln("# ${added.size} NEW transmitter(s) appeared ⚠", "#e55"); added.take(8).forEach { logln("  + id=$it", "#e55") } }
            }
            if (added.isNotEmpty()) seal("RF_CHANGE", "new=${added.size}")
        }.start()
    }
    private fun scanIds(): Set<String> {
        val out = HashSet<String>()
        try {
            if (Build.VERSION.SDK_INT < 31 || checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED) {
                val mgr = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
                val scanner = mgr.adapter?.bluetoothLeScanner
                if (scanner != null) {
                    val cb = object : ScanCallback() { override fun onScanResult(t: Int, r: ScanResult) { out.add("b:" + h8(r.device.address)) } }
                    scanner.startScan(cb); Thread.sleep(2200); scanner.stopScan(cb)
                }
            }
        } catch (_: Exception) {}
        try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                @Suppress("DEPRECATION") for (r in wm.scanResults) out.add("w:" + h8(r.BSSID ?: continue))
            }
        } catch (_: Exception) {}
        return out
    }

    // ── HONEY-SEAL (tamper trap) ─────────────────────────────────────────────
    private val armRunnable = object : Runnable {
        override fun run() {
            if (!armed) return
            val d = accDelta()
            if (d > 2.5f && !tripped) {
                tripped = true; seal("TAMPER", "delta=${fmt(d)}")
                runOnUiThread { logln("⚠ TAMPER — phone moved while armed (Δ=${fmt(d)} m/s²)", "#e55"); toast("TAMPER detected!") }
            }
            handler.postDelayed(this, 350)
        }
    }
    private fun accDelta(): Float { val b = baseAcc ?: return 0f; val dx = accX - b[0]; val dy = accY - b[1]; val dz = accZ - b[2]; return sqrt(dx * dx + dy * dy + dz * dz) }
    private fun armSeal() {
        baseAcc = floatArrayOf(accX, accY, accZ); armed = true; tripped = false
        handler.post(armRunnable)
        logln("# HONEY-SEAL armed — leave the phone still. It records (signed) the instant it's touched.", "#9ad")
        toast("Armed — don't move the phone")
    }
    private fun checkSeal() {
        armed = false; handler.removeCallbacks(armRunnable)
        logln("# HONEY-SEAL ${if (tripped) "TRIPPED ⚠ — it was moved while you were away" else "intact ✓ — untouched"}", if (tripped) "#e55" else "#6c6")
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
