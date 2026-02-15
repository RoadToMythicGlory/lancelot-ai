"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyKeyFingerprint = verifyKeyFingerprint;
exports.onKeyChange = onKeyChange;
const keys_1 = require("./keys");
async function verifyKeyFingerprint(publicKey, storedFingerprint) {
    const currentFingerprint = await (0, keys_1.computeFingerprint)(publicKey);
    return currentFingerprint === storedFingerprint;
}
function onKeyChange() {
    // Policy: disable E2EE until user verifies new key out-of-band.
    return 'warn';
}
//# sourceMappingURL=tofu.js.map