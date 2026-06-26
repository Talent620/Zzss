package com.aegisterminal

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap

/**
 * SerialBridgeModule — the native owner of the physical bus handle.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  >>> THIS IS WHERE YOU WIRE THE ELM327 / USB-SERIAL / BT LIBRARY <<<      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * JS calls reach here through NativeModules.SerialBridge (see SerialTransport.ts).
 * Implement each method against the transport named by `bus.transport`:
 *
 *   "usb-serial" / "elm327" (USB) ->  felHR85/UsbSerial  (com.felhr.usbserial)
 *        val manager = getSystemService(USB_SERVICE) as UsbManager
 *        val driver  = UsbSerialDevice.createUsbSerialDevice(device, connection)
 *        driver.open(); driver.setBaudRate(bus.baud); driver.read { onBytes(it) }
 *
 *   "bluetooth-spp" (ELM327 BT Classic) ->  react-native-bluetooth-classic
 *        or BluetoothSocket on UUID 00001101-0000-1000-8000-00805F9B34FB (SPP)
 *
 *   "ble" (ELM327 BLE) ->  react-native-ble-plx / android.bluetooth.le
 *        connect bus.serviceUuid / bus.charUuid, writeCharacteristic(frameBytes)
 *
 * SAFETY CONTRACT: this module must expose NO method that writes to the bus other
 * than writeFrames(), and writeFrames() must only ever be called by
 * BridgeController.exec() after the Physics Shield passes. Do not add a "raw
 * write" escape hatch — it would bypass the shield entirely.
 */
class SerialBridgeModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName(): String = "SerialBridge"

    @ReactMethod
    fun connect(bus: ReadableMap, promise: Promise) {
        try {
            val transport = bus.getString("transport") ?: "usb-serial"
            // TODO(plug-in): open the port for `transport`. Request USB permission
            // (UsbManager.requestPermission) or BT connect as needed, then resolve.
            when (transport) {
                "usb-serial", "elm327" -> { /* TODO: felHR85 open + baud = bus.getInt("baud") */ }
                "bluetooth-spp" -> { /* TODO: BluetoothSocket SPP connect */ }
                "ble" -> { /* TODO: BLE connect serviceUuid/charUuid */ }
                else -> throw IllegalArgumentException("unknown transport $transport")
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CONNECT_FAILED", e)
        }
    }

    @ReactMethod
    fun identify(promise: Promise) {
        try {
            // TODO(plug-in): query the device for its id + live telemetry. For
            // ELM327 send ATZ / 0105 (coolant temp) / 0142 (control module V) etc.,
            // or your device's own diagnostic frame, and parse the response.
            val readings = WritableNativeMap().apply {
                putString("deviceId", "REPLACE_WITH_DEVICE_ID")
                putDouble("volts", 0.0)
                putDouble("tempC", 0.0)
                putDouble("currentA", 0.0)
            }
            promise.resolve(readings)
        } catch (e: Exception) {
            promise.reject("IDENTIFY_FAILED", e)
        }
    }

    @ReactMethod
    fun writeFrames(frames: ReadableArray, promise: Promise) {
        try {
            // TODO(plug-in): serialize each frame string to bytes per your framing
            // and write to the open port. This is the ONLY sanctioned write path.
            for (i in 0 until frames.size()) {
                val frame = frames.getString(i) ?: continue
                // port.write(frame.toByteArray(Charsets.UTF_8))
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WRITE_FAILED", e)
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            // TODO(plug-in): close port / socket / gatt.
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_FAILED", e)
        }
    }
}
