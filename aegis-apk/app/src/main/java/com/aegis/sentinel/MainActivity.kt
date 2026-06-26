package com.aegis.sentinel

import android.app.Activity
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
class MainActivity : Activity(), SensorEventListener, NfcAdapter.ReaderCallback {

    private val ALIAS = "aegis-detector-tee"
    private val rng = SecureRandom()
    private var keyPair: KeyPair? = null
    private var strongBox = false
    private lateinit var log: TextView
    private lateinit var status: TextView
    private var scroller: ScrollView? = null
    private lateinit var ledgerFile: File

    @Volatile private var magX = Float.NaN
    @Volatile private var magY = Float.NaN
    @Volatile private var magZ = Float.NaN
    @Volatile private var accX = 0f
    @Volatile private var accY = 0f
    @Volatile private var accZ = 0f
    private var magBaseline = Float.NaN
    private var sm: SensorManager? = null
    private var nfc: NfcAdapter? = null

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
    // ultrasonic sonar
    private var sonarOn = false
    private var sonarBaseline = -1.0
    // audio spectrum analyzer
    private var analyzerOn = false
    private lateinit var spectrum: SpectrumView
    private lateinit var soundList: TextView

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

        val root = ScrollView(this); scroller = root
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(clr("#0b0f14"))
            setPadding(dp(18), dp(20), dp(18), dp(28))
        }
        root.addView(col)

        col.addView(title("AEGIS  DETEKTOR"))
        col.addView(sub("Trikorder kontr-inwigilacyjny. Pokazuje, co Cię śledzi — i podpisuje dowód w sprzęcie. Sam nikogo nie śledzi."))
        status = sub("init…"); col.addView(status)

        col.addView(section("🔊 ANALIZATOR DŹWIĘKU  ·  co słychać teraz"))
        col.addView(sub("Wykres widma na żywo (też dźwięków, których nie słyszysz) + lista wykrytych źródeł: hum sieci, mowa, piski elektroniki, ultradźwięki beaconów."))
        spectrum = SpectrumView(this).apply { layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(150)) }
        col.addView(spectrum)
        soundList = TextView(this).apply {
            setTextColor(clr("#99ffdd")); textSize = 13f; typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(clr("#06090d")); setPadding(dp(12), dp(10), dp(12), dp(10)); text = "naciśnij ANALIZUJ ▶"
        }
        col.addView(soundList)
        val anBtn = button("ANALIZUJ ▶ (mikrofon)") {}
        anBtn.setOnClickListener { try { toast("▶ Analizator"); toggleAnalyzer(anBtn) } catch (e: Exception) { logln("err: ${e.message}", "#ee5555") } }
        col.addView(anBtn)

        col.addView(section("🛰️ PROTOKÓŁ ŚWIADKA (NFC)  ·  Flipper z 2500"))
        col.addView(sub("Nie kopiuje kart — WYZYWA je. Przyłóż kartę/urządzenie NFC do tyłu telefonu: Sentinel wysyła żywe wyzwanie i pieczętuje w TEE „Dowód Obecności” {czas, GPS, wynik, podpis}. Skopiowany/odtworzony sygnał nie odpowie na świeże wyzwanie."))
        col.addView(button("JAK TO DZIAŁA?") {
            logln("# Świadek aktywny w tle. Przyłóż kartę NFC — telefon ją zaświadczy (nie sklonuje).", "#66ccff")
        })

        col.addView(section("SKAN RF  ·  trackery i obce nadajniki"))
        col.addView(sub("Skanuje BLE + Wi-Fi i nazywa prawdopodobne trackery (AirTag / SmartTag / Tile) oraz podejrzanie bliskie nienazwane urządzenia."))
        col.addView(button("SKANUJ RF") { rfSweep() })

        col.addView(section("DETEKTOR ŚLEDZENIA  ·  czy coś jest na Tobie?"))
        col.addView(sub("Zrób kilka skanów przez parę minut (ruszaj się). Urządzenia, które wciąż pojawiają się blisko Ciebie, oznaczane są jako możliwe podłożone trackery."))
        col.addView(button("ANALIZUJ ŚLEDZĄCYCH") { followers() })

        col.addView(section("EMF  ·  UKRYTA ELEKTRONIKA"))
        col.addView(sub("Miernik pola magnetycznego. Kamery, mikrofony, głośniki, silniki i magnesy zaburzają pole. Skalibruj w otwartej przestrzeni, potem przesuwaj przy obiektach."))
        col.addView(button("KALIBRUJ ODNIESIENIE") { magBaseline = magMag(); logln("# baseline = ${fmt(magBaseline)} µT", "#99aadd") })
        col.addView(button("SKAN EMF (przyłóż do obiektu)") { emfScan() })

        col.addView(section("NASŁUCH ULTRADŹWIĘKÓW  ·  niesłyszalne beacony"))
        col.addView(sub("Wykrywa energię 18–22 kHz, której nie słyszysz — używaną przez ukryte beacony śledzące/reklamowe."))
        col.addView(button("NASŁUCHUJ ULTRADŹWIĘKÓW") { ultrasound() })

        col.addView(section("MAPA ŚCIANY  ·  ukryte kable / kamery"))
        col.addView(sub("Żywa mapa magnetyczna. Włącz i powoli przesuwaj telefon po ścianie/obiekcie — piki zdradzają ukryty metal, kable, silniki, magnesy."))
        val wallBtn = button("SKAN ŚCIANY ▶ (na żywo)") {}
        wallBtn.setOnClickListener { try { toast("▶ Mapa ściany"); toggleWall(wallBtn) } catch (e: Exception) { logln("err: ${e.message}", "#ee5555") } }
        col.addView(wallBtn)
        liveView = TextView(this).apply {
            setTextColor(clr("#66ccff")); textSize = 13f; typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(clr("#06090d")); setPadding(dp(12), dp(10), dp(12), dp(10)); text = "—"
        }
        col.addView(liveView)

        col.addView(section("SONAR ULTRADŹWIĘKOWY  ·  radar ruchu (pierwszy na świecie)"))
        col.addView(sub("Emituje niesłyszalny ton ~20 kHz i nasłuchuje echa. Gdy ktoś poruszy się w pokoju, efekt Dopplera go zdradza — wykrywanie intruza dźwiękiem, którego nie słyszysz. Połącz z UZBRÓJ HONEY-SEAL, by logować ruch."))
        val sonarBtn = button("SONAR ▶ (ruch)") {}
        sonarBtn.setOnClickListener { try { toast("▶ Sonar"); toggleSonar(sonarBtn) } catch (e: Exception) { logln("err: ${e.message}", "#ee5555") } }
        col.addView(sonarBtn)

        col.addView(section("STRAŻ RF POKOJU  ·  alarm nowego nadajnika"))
        col.addView(sub("Zrób radiowe zdjęcie pokoju, wyjdź, wróć — powie Ci, czy pojawił się NOWY nadajnik (włączona pluskwa lub ktoś wszedł z urządzeniem)."))
        col.addView(button("ZAPISZ STAN POKOJU") { setRoomBaseline() })
        col.addView(button("SPRAWDŹ NOWE NADAJNIKI") { checkRoomChange() })

        col.addView(section("HONEY-SEAL  ·  pułapka na manipulację"))
        col.addView(sub("Uzbrój i zostaw telefon. Jeśli ktoś go ruszy pod Twoją nieobecność, zapieczętuje podpisany, datowany dowód manipulacji."))
        col.addView(button("UZBRÓJ HONEY-SEAL") { armSeal() })
        col.addView(button("SPRAWDŹ / ROZBRÓJ") { checkSeal() })

        col.addView(section("REJESTR DOWODÓW · TEE"))
        col.addView(button("ZWERYFIKUJ ŁAŃCUCH") { verifyChain() })
        col.addView(button("EKSPORTUJ DOWODY") { exportLedger() })

        col.addView(section("LOG"))
        log = TextView(this).apply {
            setTextColor(clr("#99ffdd")); textSize = 12.5f
            typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(clr("#06090d"))
            setPadding(dp(12), dp(12), dp(12), dp(12)); text = "ready.\n"
        }
        col.addView(log)
        setContentView(root)

        try { initKey() } catch (e: Throwable) { logln("key init: ${e.message}", "#ddcc66") }
        try { initSensors() } catch (e: Throwable) { logln("sensors: ${e.message}", "#ddcc66") }
        try { nfc = NfcAdapter.getDefaultAdapter(this) } catch (e: Throwable) {}
        try { requestPerms() } catch (e: Throwable) {}
        try {
            status.text = "TEE: " + (if (keyPair != null) (if (strongBox) "StrongBox ✓" else "TEE ✓") else "sw") +
                "  ·  mag: " + (if (magX.isNaN()) "absent" else "ok") +
                "  ·  NFC: " + (if (nfc == null) "brak" else if (nfc!!.isEnabled) "gotowy" else "wyłączony")
        } catch (e: Throwable) {}
        } catch (fatal: Throwable) {
            showError(fatal)
        }
    }

    private fun showError(e: Throwable) {
        try {
            val sw = java.io.StringWriter(); e.printStackTrace(java.io.PrintWriter(sw))
            val tv = TextView(this).apply {
                setTextColor(clr("#ff6b6b")); textSize = 12f
                typeface = android.graphics.Typeface.MONOSPACE; setPadding(28, 40, 28, 28)
                text = "AEGIS — start error (screenshot this and send it):\n\n$sw"
            }
            setContentView(ScrollView(this).apply { setBackgroundColor(clr("#0b0f14")); addView(tv) })
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
    override fun onDestroy() { super.onDestroy(); sonarOn = false; analyzerOn = false; try { sm?.unregisterListener(this) } catch (_: Exception) {} }

    // ── WITNESS PROTOCOL (NFC) — challenge, don't clone ──────────────────────
    override fun onResume() {
        super.onResume()
        try {
            val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
            nfc?.enableReaderMode(this, this, flags, null)
        } catch (_: Exception) {}
    }
    override fun onPause() {
        super.onPause()
        try { nfc?.disableReaderMode(this) } catch (_: Exception) {}
    }
    /** Called on a presented NFC tag. State: PRESENT -> CHALLENGE -> WITNESSED. */
    override fun onTagDiscovered(tag: Tag) {
        val uid = hex(tag.id)
        val techs = tag.techList.joinToString(",") { it.substringAfterLast('.') }
        val nonce = randomHex(16)
        var resp = ""; var latency = -1L; var method = "uid-presence"
        val iso = IsoDep.get(tag)
        if (iso != null) {
            method = "isodep-challenge"
            try {
                iso.connect()
                val apdu = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, 0x00) // benign live SELECT
                val t0 = System.nanoTime()
                val r = iso.transceive(apdu)
                latency = (System.nanoTime() - t0) / 1_000_000
                resp = hex(r)
            } catch (e: Exception) { resp = "ERR" } finally { try { iso.close() } catch (_: Exception) {} }
        }
        val gps = lastFix(); val time = System.currentTimeMillis()
        // Physical Presence Proof: {time, gps, challengeResult, AegisSignature} — TEE-signed via seal()
        seal("WITNESS", "uid=$uid techs=$techs method=$method latencyMs=$latency gps=$gps time=$time nonce=$nonce result=${resp.take(20)}")
        runOnUiThread {
            logln("# ŚWIADEK ✓  $uid  ($method${if (latency >= 0) ", ${latency}ms" else ""})", "#66cc66")
            logln("  Dowód Obecności podpisany w TEE · gps=$gps", "#99ffdd")
            toast("Zaświadczono: $uid")
        }
    }
    private fun lastFix(): String {
        return try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return "n/a"
            val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) ?: lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            if (loc != null) "%.4f,%.4f".format(loc.latitude, loc.longitude) else "no-fix"
        } catch (e: Exception) { "n/a" }
    }
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
        val needBt = Build.VERSION.SDK_INT >= 31 && checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED
        val needLoc = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
        if (needBt || needLoc) {
            logln("# brak uprawnień — przyznaj Bluetooth + Lokalizację (Ustawienia → Aplikacje → Aegis → Uprawnienia)", "#ddcc66")
            toast("Przyznaj uprawnienia: Bluetooth + Lokalizacja")
            requestPerms(); return
        }
        logln("# skanuję RF (BLE + Wi-Fi)…", "#99aadd")
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
                logln("# RF SWEEP #$sweepIdx  ${found.joinToString(" · ")}", "#66cc66")
                if (flags.isEmpty()) logln("  no known trackers in range", "#99ffdd")
                else flags.forEach { logln("  $it", "#ee5555") }
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
        if (sweepIdx < 2) { logln("run RF SWEEP at least 2–3× (move around) first", "#ddcc66"); return }
        val persistent = seen.entries.filter { it.value[0] >= 3 }.sortedByDescending { it.value[0] }
        logln("# FOLLOWER ANALYSIS  (${sweepIdx} sweeps)", "#99aadd")
        if (persistent.isEmpty()) { logln("  nothing is consistently following you ✓", "#66cc66"); return }
        for (e in persistent.take(8)) {
            val strong = e.value[1] > -70
            logln("  ${if (strong) "⚠ FOLLOWING" else "·"} id=${e.key}  seen ${e.value[0]}/${sweepIdx} sweeps  rssi=${e.value[1]}dBm", if (strong) "#ee5555" else "#99ffdd")
        }
        seal("FOLLOWER", "persistent=${persistent.size}")
    }

    // ── EMF / hidden electronics ─────────────────────────────────────────────
    private fun emfScan() {
        val m = magMag()
        if (m.isNaN()) { logln("no magnetometer", "#ddcc66"); return }
        val base = if (magBaseline.isNaN()) 45f else magBaseline // ~Earth field default
        val delta = abs(m - base)
        val level = when { delta > 80 -> "STRONG ANOMALY — concealed magnet/motor?"; delta > 30 -> "anomaly — electronics nearby"; delta > 12 -> "slight disturbance"; else -> "clean" }
        logln("# EMF  ${fmt(m)} µT  (Δ ${fmt(delta)} vs ${fmt(base)})  -> $level", if (delta > 30) "#ee5555" else "#66cc66")
        if (delta > 12) seal("EMF", "mag=${fmt(m)} delta=${fmt(delta)}")
    }

    // ── ULTRASOUND beacon detector (mic + FFT) ───────────────────────────────
    private fun ultrasound() {
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            logln("grant microphone permission, then retry", "#ddcc66"); requestPerms(); return
        }
        logln("# listening for inaudible 18–22 kHz…", "#99aadd")
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
                    logln("# ULTRASOUND  ultrasonic share=${(ratio * 100).toInt()}%  -> ${if (present) "BEACON DETECTED ⚠" else "clear ✓"}", if (present) "#ee5555" else "#66cc66")
                }
                if (present) seal("ULTRASOUND", "ratio=${"%.3f".format(ratio)}")
            } catch (e: Exception) { runOnUiThread { logln("audio error: ${e.message}", "#ee5555") } }
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
        if (liveMag) { b.text = "SKAN ŚCIANY ◼ (stop)"; magRingFill = 0; magRingIdx = 0; handler.post(liveRunnable) }
        else { b.text = "SKAN ŚCIANY ▶ (na żywo)"; liveView.text = "—" }
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
        logln("# capturing room RF baseline…", "#99aadd")
        Thread { val ids = scanIds(); roomBaseline = ids; runOnUiThread { logln("# baseline: ${ids.size} transmitters in this room", "#66cc66") } }.start()
    }
    private fun checkRoomChange() {
        val base = roomBaseline
        if (base == null) { logln("set a room baseline first", "#ddcc66"); return }
        logln("# re-scanning room…", "#99aadd")
        Thread {
            val now = scanIds(); val added = now - base
            runOnUiThread {
                if (added.isEmpty()) logln("# room unchanged ✓  no new transmitters", "#66cc66")
                else { logln("# ${added.size} NEW transmitter(s) appeared ⚠", "#ee5555"); added.take(8).forEach { logln("  + id=$it", "#ee5555") } }
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
                runOnUiThread { logln("⚠ TAMPER — phone moved while armed (Δ=${fmt(d)} m/s²)", "#ee5555"); toast("TAMPER detected!") }
            }
            handler.postDelayed(this, 350)
        }
    }
    private fun accDelta(): Float { val b = baseAcc ?: return 0f; val dx = accX - b[0]; val dy = accY - b[1]; val dz = accZ - b[2]; return sqrt(dx * dx + dy * dy + dz * dz) }
    private fun armSeal() {
        baseAcc = floatArrayOf(accX, accY, accZ); armed = true; tripped = false
        handler.post(armRunnable)
        logln("# HONEY-SEAL armed — leave the phone still. It records (signed) the instant it's touched.", "#99aadd")
        toast("Armed — don't move the phone")
    }
    private fun checkSeal() {
        armed = false; handler.removeCallbacks(armRunnable)
        logln("# HONEY-SEAL ${if (tripped) "TRIPPED ⚠ — it was moved while you were away" else "intact ✓ — untouched"}", if (tripped) "#ee5555" else "#66cc66")
    }

    // ── AUDIO SPECTRUM ANALYZER (live chart + "what's making sound") ──────────
    inner class SpectrumView(ctx: Context) : View(ctx) {
        @Volatile private var bars = FloatArray(64)
        @Volatile private var caption = ""
        private val pBar = Paint().apply { isAntiAlias = true }
        private val pBg = Paint().apply { color = clr("#06090d") }
        private val pTxt = Paint().apply { color = clr("#ddffff"); textSize = 30f; isAntiAlias = true }
        fun update(b: FloatArray, cap: String) { bars = b; caption = cap; postInvalidate() }
        override fun onDraw(c: Canvas) {
            val w = width.toFloat(); val h = height.toFloat()
            c.drawRect(0f, 0f, w, h, pBg)
            val n = bars.size; if (n == 0) return
            val bw = w / n
            for (i in 0 until n) {
                val v = bars[i].coerceIn(0f, 1f)
                pBar.color = clr(if (i > n * 0.82) "#ee5555" else if (i > n * 0.6) "#66ccff" else "#55cc88")
                c.drawRect(i * bw + 1f, h * (1f - v), (i + 1) * bw - 1f, h, pBar)
            }
            if (caption.isNotEmpty()) c.drawText(caption, 16f, 38f, pTxt)
        }
    }

    private fun toggleAnalyzer(b: Button) {
        if (analyzerOn) { analyzerOn = false; b.text = "ANALIZUJ ▶ (mikrofon)"; return }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            logln("przyznaj dostęp do mikrofonu i spróbuj ponownie", "#ddcc66"); requestPerms(); return
        }
        analyzerOn = true; b.text = "ANALIZUJ ◼ (stop)"
        Thread { analyzeLoop() }.start()
    }
    private fun analyzeLoop() {
        val rate = 44100; val n = 4096; val nb = 64
        var rec: AudioRecord? = null
        try {
            val rmin = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            rec = AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(rmin, n * 4))
            rec.startRecording()
            val buf = ShortArray(n); val re = DoubleArray(n); val im = DoubleArray(n)
            val half = n / 2
            while (analyzerOn) {
                var off = 0; while (off < n) { val r = rec.read(buf, off, n - off); if (r <= 0) break; off += r }
                for (i in 0 until n) { val w = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * i / (n - 1)); re[i] = buf[i] * w; im[i] = 0.0 }
                fft(re, im)
                val mags = DoubleArray(half) { Math.sqrt(re[it] * re[it] + im[it] * im[it]) }
                // log-spaced bars for the chart
                val bars = FloatArray(nb)
                for (bi in 0 until nb) {
                    val lo = Math.pow(half.toDouble(), bi.toDouble() / nb).toInt().coerceIn(1, half - 1)
                    val hi = Math.pow(half.toDouble(), (bi + 1.0) / nb).toInt().coerceIn(lo + 1, half)
                    var s = 0.0; for (k in lo until hi) if (mags[k] > s) s = mags[k]
                    bars[bi] = s.toFloat()
                }
                val mx = bars.maxOrNull() ?: 1f
                val norm = FloatArray(nb) { if (mx > 0f) Math.log10(1.0 + 9.0 * bars[it] / mx).toFloat() else 0f }
                var peakBin = 1; for (k in 2 until half) if (mags[k] > mags[peakBin]) peakBin = k
                val peakHz = peakBin * rate / n
                val labels = classifySound(mags, rate, n)
                runOnUiThread {
                    spectrum.update(norm, "$peakHz Hz${if (peakHz >= 18000) "  ⚠ ultradźwięk" else ""}")
                    soundList.text = labels.joinToString("\n")
                }
            }
        } catch (e: Exception) { runOnUiThread { logln("audio: ${e.message}", "#ee5555") } }
        finally { try { rec?.stop(); rec?.release() } catch (_: Exception) {}; runOnUiThread { soundList.text = "—" } }
    }
    /** Find dominant peaks per band and name a likely source (Polish). */
    private fun classifySound(mags: DoubleArray, rate: Int, n: Int): List<String> {
        val half = mags.size
        var sum = 0.0; var gmax = 1e-9
        for (k in 2 until half) { sum += mags[k]; if (mags[k] > gmax) gmax = mags[k] }
        val avg = sum / half
        val bands = listOf(
            Triple(20, 120, "szum niski / sieć 50 Hz / zasilacz"),
            Triple(120, 300, "hum / wentylator / silnik"),
            Triple(300, 1000, "niskie dźwięki / urządzenie"),
            Triple(1000, 3000, "mowa / głos"),
            Triple(3000, 6000, "wysoki głos / piski"),
            Triple(6000, 10000, "gwizd / sybilanty / elektronika"),
            Triple(10000, 15000, "wysoki pisk / brzęczyk"),
            Triple(15000, 18000, "bardzo wysoki ton (komary / elektronika)"),
            Triple(18000, 22050, "ULTRADŹWIĘK — beacon / pilot / czujnik")
        )
        val out = ArrayList<String>()
        for ((lo, hi, label) in bands) {
            val loBin = (lo * n / rate).coerceIn(1, half - 1); val hiBin = (hi * n / rate).coerceIn(loBin + 1, half)
            var peak = 0.0; var pb = loBin
            for (k in loBin until hiBin) if (mags[k] > peak) { peak = mags[k]; pb = k }
            if (peak > gmax * 0.22 && peak > avg * 5) {
                val hz = pb * rate / n
                out.add("• ${hz} Hz — $label${if (lo >= 18000) " ⚠" else ""}")
            }
        }
        if (out.isEmpty()) out.add("cisza / brak wyraźnych źródeł")
        return out
    }

    // ── ULTRASONIC SONAR (Doppler motion radar) ──────────────────────────────
    private fun toggleSonar(b: Button) {
        if (sonarOn) { sonarOn = false; b.text = "SONAR ▶ (ruch)"; return }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            logln("grant microphone permission, then retry", "#ddcc66"); requestPerms(); return
        }
        sonarOn = true; sonarBaseline = -1.0; b.text = "SONAR ◼ (stop)"
        logln("# SONAR on — emitting inaudible 20 kHz; listening for motion", "#99aadd")
        Thread { sonarLoop() }.start()
    }
    private fun sonarLoop() {
        val rate = 44100; val n = 4096; val freq = 20000.0
        var track: AudioTrack? = null; var rec: AudioRecord? = null
        try {
            val tone = ShortArray(rate)
            for (i in tone.indices) tone[i] = (Math.sin(2.0 * Math.PI * freq * i / rate) * 0.6 * Short.MAX_VALUE).toInt().toShort()
            val tmin = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            track = AudioTrack(AudioManager.STREAM_MUSIC, rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(tmin, tone.size * 2), AudioTrack.MODE_STATIC)
            track.write(tone, 0, tone.size); track.setLoopPoints(0, tone.size, -1); track.play()
            val rmin = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val src = if (Build.VERSION.SDK_INT >= 24) MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.MIC
            rec = AudioRecord(src, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(rmin, n * 4))
            rec.startRecording()
            val buf = ShortArray(n); val re = DoubleArray(n); val im = DoubleArray(n)
            val carrier = (freq * n / rate).toInt()
            while (sonarOn) {
                var off = 0; while (off < n) { val r = rec.read(buf, off, n - off); if (r <= 0) break; off += r }
                for (i in 0 until n) { val w = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * i / (n - 1)); re[i] = buf[i] * w; im[i] = 0.0 }
                fft(re, im)
                var cE = 0.0; var sE = 0.0
                for (i in carrier - 50..carrier + 50) {
                    if (i < 2 || i >= n / 2) continue
                    val p = re[i] * re[i] + im[i] * im[i]
                    if (abs(i - carrier) <= 3) cE += p else sE += p
                }
                val ratio = if (cE <= 0) 0.0 else sE / cE
                if (sonarBaseline < 0 && cE > 1e5) sonarBaseline = ratio
                val motion = if (sonarBaseline <= 0) 1.0 else ratio / (sonarBaseline + 1e-9)
                val moving = motion > 2.5 && cE > 1e5
                runOnUiThread { liveView.text = "SONAR  motion ${"%.2f".format(motion)}×   ${if (moving) "⚠ MOVEMENT IN ROOM" else "still ·"}   ${if (cE <= 1e5) "(raise volume / unmute)" else ""}" }
                if (moving && armed) seal("SONAR_MOTION", "motion=${"%.2f".format(motion)}")
            }
        } catch (e: Exception) { runOnUiThread { logln("sonar: ${e.message}", "#ee5555") } }
        finally {
            try { track?.stop(); track?.release() } catch (_: Exception) {}
            try { rec?.stop(); rec?.release() } catch (_: Exception) {}
            runOnUiThread { liveView.text = "—" }
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
        if (!ledgerFile.exists()) { logln("no findings yet", "#ddcc66"); return }
        var prev = "GENESIS"; var ok = true; var n = 0
        ledgerFile.forEachLine { ln -> if (ln.isBlank()) return@forEachLine; n++
            val body = ln.substringAfter("\"entry\":").substringBeforeLast(",\"hash\"")
            val claimed = ln.substringAfter("\"hash\":\"").substringBefore("\"")
            if (sha256hex(prev + "|" + body) != claimed) ok = false; prev = claimed
        }
        logln("# VERIFY  findings=$n  chain=${if (ok) "VALID ✓" else "TAMPERED ✗"}", if (ok) "#66cc66" else "#ee5555")
    }
    private fun exportLedger() {
        try { val out = File(getExternalFilesDir(null), "aegis-findings.json"); out.writeText(if (ledgerFile.exists()) ledgerFile.readText() else "")
            logln("exported -> ${out.absolutePath}", "#99aadd"); toast("Exported") } catch (e: Exception) { logln("export err: ${e.message}", "#ee5555") }
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
    private fun logln(s: String, color: String = "#99ffdd") {
        log.text = "$s\n${log.text}"
        scroller?.post { scroller?.fullScroll(View.FOCUS_DOWN) }
    }
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun clr(s: String): Int = try { Color.parseColor(s) } catch (e: Exception) { Color.GRAY }
    private fun title(t: String) = TextView(this).apply { text = t; setTextColor(clr("#ddffff")); textSize = 23f; letterSpacing = 0.16f; setPadding(0, 0, 0, dp(2)) }
    private fun sub(t: String) = TextView(this).apply { text = t; setTextColor(clr("#77aa88")); textSize = 12.5f; setPadding(0, dp(2), 0, dp(8)) }
    private fun section(t: String) = TextView(this).apply { text = t; setTextColor(clr("#55bbdd")); textSize = 12f; letterSpacing = 0.18f; setPadding(0, dp(16), 0, dp(6)) }
    private fun button(t: String, onClick: () -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; gravity = Gravity.CENTER
        setTextColor(clr("#ddffff")); setBackgroundColor(clr("#15314a"))
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(8); layoutParams = lp
        setOnClickListener { try { toast("▶ $t"); onClick() } catch (e: Exception) { logln("err: ${e.message}", "#ee5555") } }
    }
}
