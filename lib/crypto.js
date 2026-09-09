const crypto = require("crypto");

// Derives a stable 32-byte key from whatever string is in ENCRYPTION_KEY,
// so OAuth2 access/refresh tokens are never written to the DB in plain text.
function getKey() {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) {
        throw new Error("ENCRYPTION_KEY is not set in .env — required to store OAuth2 tokens securely");
    }
    return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(plainText) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(payload) {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
