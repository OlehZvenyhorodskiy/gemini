/**
 * PCM Processor — AudioWorklet for high-quality, low-latency mic capture.
 *
 * Runs in a separate audio thread (way better than ScriptProcessor).
 * Grabs 128-sample frames, converts Float32 → Int16 PCM, and posts
 * the raw bytes back to the main thread for WebSocket transmission.
 *
 * Input:  Float32 samples from the mic (usually 16kHz via AudioContext)
 * Output: Int16 PCM buffer, posted via this.port.postMessage()
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._bufferSize = 4096;
        this._buffer = new Float32Array(this._bufferSize);
        this._writeIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0];
        if (!channelData) return true;

        // Accumulate samples into our buffer
        for (let i = 0; i < channelData.length; i++) {
            this._buffer[this._writeIndex++] = channelData[i];

            // When buffer is full, convert and send
            if (this._writeIndex >= this._bufferSize) {
                this._sendBuffer();
                this._writeIndex = 0;
            }
        }

        return true;
    }

    _sendBuffer() {
        // Convert Float32 → Int16 PCM
        const pcmData = new Int16Array(this._bufferSize);
        for (let i = 0; i < this._bufferSize; i++) {
            // Clamp to [-1, 1] then scale to Int16 range
            const sample = Math.max(-1, Math.min(1, this._buffer[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        // Post the raw PCM bytes back to the main thread
        this.port.postMessage(pcmData.buffer, [pcmData.buffer]);

        // Allocate a fresh buffer (the old one got transferred)
        this._buffer = new Float32Array(this._bufferSize);
    }
}

registerProcessor("pcm-processor", PCMProcessor);
