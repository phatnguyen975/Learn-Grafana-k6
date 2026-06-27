package mycrypto

import (
    "crypto/sha256"
    "encoding/hex"
    "strings"
    "go.k6.io/k6/js/modules"
)

// init is called by the Go runtime to register the module.
func init() {
    modules.Register("k6/x/mycrypto", new(MyCrypto))
}

// MyCrypto is the struct that will be exposed to JavaScript.
type MyCrypto struct{}

// GenerateCustomHash is the method we want to call from our k6 JS script.
// Notice the 4-space indentation standard.
func (m *MyCrypto) GenerateCustomHash(input string, salt string) string {
    // Simulate a proprietary hashing logic: Convert to uppercase, concat salt, then SHA256
    processedString := strings.ToUpper(input) + "_" + salt

    hash := sha256.Sum256([]byte(processedString))

    return hex.EncodeToString(hash[:])
}
