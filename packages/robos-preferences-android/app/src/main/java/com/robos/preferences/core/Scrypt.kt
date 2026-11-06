package com.robos.preferences.core

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * scrypt (RFC 7914), the key derivation the desktop's Config Sync uses for passphrase
 * backups (Node's crypto.scryptSync with N=32768, r=8, p=1). Android has no built-in scrypt.
 */
object Scrypt {
    fun derive(password: ByteArray, salt: ByteArray, n: Int, r: Int, p: Int, dkLen: Int): ByteArray {
        require(n > 1 && n and (n - 1) == 0) { "N must be a power of two." }
        val blockSize = 128 * r
        val b = pbkdf2(password, salt, p * blockSize)
        val xy = ByteArray(2 * blockSize)
        val v = ByteArray(blockSize * n)
        for (i in 0 until p) smix(b, i * blockSize, r, n, v, xy)
        return pbkdf2(password, b, dkLen)
    }

    /** PBKDF2-HMAC-SHA256 with one iteration, which is all scrypt uses. */
    private fun pbkdf2(password: ByteArray, salt: ByteArray, dkLen: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(keyFor(password), "HmacSHA256")) }
        val out = ByteArray(dkLen)
        var block = 1
        var offset = 0
        while (offset < dkLen) {
            mac.update(salt)
            mac.update(byteArrayOf((block ushr 24).toByte(), (block ushr 16).toByte(), (block ushr 8).toByte(), block.toByte()))
            val u = mac.doFinal()
            val take = minOf(u.size, dkLen - offset)
            System.arraycopy(u, 0, out, offset, take)
            offset += take
            block += 1
        }
        return out
    }

    // HMAC accepts an empty key, but SecretKeySpec does not. HMAC pads a short key with
    // zeros to 64 bytes, so 64 zero bytes give the same result as an empty password.
    private fun keyFor(password: ByteArray): ByteArray = if (password.isEmpty()) ByteArray(64) else password

    private fun smix(b: ByteArray, bi: Int, r: Int, n: Int, v: ByteArray, xy: ByteArray) {
        val blockSize = 128 * r
        val yi = blockSize
        System.arraycopy(b, bi, xy, 0, blockSize)
        for (i in 0 until n) {
            System.arraycopy(xy, 0, v, i * blockSize, blockSize)
            blockMix(xy, yi, r)
        }
        for (i in 0 until n) {
            val j = integerify(xy, r) and (n - 1)
            for (k in 0 until blockSize) xy[k] = (xy[k].toInt() xor v[j * blockSize + k].toInt()).toByte()
            blockMix(xy, yi, r)
        }
        System.arraycopy(xy, 0, b, bi, blockSize)
    }

    private fun blockMix(by: ByteArray, yi: Int, r: Int) {
        val x = ByteArray(64)
        System.arraycopy(by, (2 * r - 1) * 64, x, 0, 64)
        for (i in 0 until 2 * r) {
            for (k in 0 until 64) x[k] = (x[k].toInt() xor by[i * 64 + k].toInt()).toByte()
            salsa8(x)
            System.arraycopy(x, 0, by, yi + i * 64, 64)
        }
        for (i in 0 until r) System.arraycopy(by, yi + (i * 2) * 64, by, i * 64, 64)
        for (i in 0 until r) System.arraycopy(by, yi + (i * 2 + 1) * 64, by, (i + r) * 64, 64)
    }

    private fun integerify(b: ByteArray, r: Int): Int {
        val i = (2 * r - 1) * 64
        return (b[i].toInt() and 0xff) or ((b[i + 1].toInt() and 0xff) shl 8) or
            ((b[i + 2].toInt() and 0xff) shl 16) or ((b[i + 3].toInt() and 0xff) shl 24)
    }

    private fun salsa8(b: ByteArray) {
        val input = IntArray(16) { i ->
            (b[i * 4].toInt() and 0xff) or ((b[i * 4 + 1].toInt() and 0xff) shl 8) or
                ((b[i * 4 + 2].toInt() and 0xff) shl 16) or ((b[i * 4 + 3].toInt() and 0xff) shl 24)
        }
        val x = input.copyOf()
        fun r(a: Int, n: Int) = (a shl n) or (a ushr (32 - n))
        repeat(4) {
            x[4] = x[4] xor r(x[0] + x[12], 7); x[8] = x[8] xor r(x[4] + x[0], 9)
            x[12] = x[12] xor r(x[8] + x[4], 13); x[0] = x[0] xor r(x[12] + x[8], 18)
            x[9] = x[9] xor r(x[5] + x[1], 7); x[13] = x[13] xor r(x[9] + x[5], 9)
            x[1] = x[1] xor r(x[13] + x[9], 13); x[5] = x[5] xor r(x[1] + x[13], 18)
            x[14] = x[14] xor r(x[10] + x[6], 7); x[2] = x[2] xor r(x[14] + x[10], 9)
            x[6] = x[6] xor r(x[2] + x[14], 13); x[10] = x[10] xor r(x[6] + x[2], 18)
            x[3] = x[3] xor r(x[15] + x[11], 7); x[7] = x[7] xor r(x[3] + x[15], 9)
            x[11] = x[11] xor r(x[7] + x[3], 13); x[15] = x[15] xor r(x[11] + x[7], 18)
            x[1] = x[1] xor r(x[0] + x[3], 7); x[2] = x[2] xor r(x[1] + x[0], 9)
            x[3] = x[3] xor r(x[2] + x[1], 13); x[0] = x[0] xor r(x[3] + x[2], 18)
            x[6] = x[6] xor r(x[5] + x[4], 7); x[7] = x[7] xor r(x[6] + x[5], 9)
            x[4] = x[4] xor r(x[7] + x[6], 13); x[5] = x[5] xor r(x[4] + x[7], 18)
            x[11] = x[11] xor r(x[10] + x[9], 7); x[8] = x[8] xor r(x[11] + x[10], 9)
            x[9] = x[9] xor r(x[8] + x[11], 13); x[10] = x[10] xor r(x[9] + x[8], 18)
            x[12] = x[12] xor r(x[15] + x[14], 7); x[13] = x[13] xor r(x[12] + x[15], 9)
            x[14] = x[14] xor r(x[13] + x[12], 13); x[15] = x[15] xor r(x[14] + x[13], 18)
        }
        for (i in 0 until 16) {
            val v = x[i] + input[i]
            b[i * 4] = v.toByte()
            b[i * 4 + 1] = (v ushr 8).toByte()
            b[i * 4 + 2] = (v ushr 16).toByte()
            b[i * 4 + 3] = (v ushr 24).toByte()
        }
    }
}
