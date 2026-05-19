---
slug: allsafe-part1
title: AllSafe - Part 1
authors: [wesam]
date: 2026-05-01
---

AllSafe is an intentionally vulnerable Android app. This part covers challenges 1–6.

{/* truncate */}

## 1. Insecure Logging

### Objective:

![image.png](/img/img7.png)

### Solution:

- just get PID of app so we can filterate logs

```bash
adb shell pidof  infosecadventures.allsafe
4713
```

- Just **`adb logcat —pid=4713`**
    
    ![image.png](/img/img6.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 2. Hardcoded Credentials

### Objective

![image.png](/img/img8.png)

### Solution:

- Decompile the APK using **JADX** and navigate to the `HardcodedCredentials` class. A static string named `BODY` contains a SOAP XML envelope with plaintext administrative credentials:
    - **Username:** `superadmin`
    - **Password:** `supersecurepassword`

![image.png](/img/img9.png)

- In the same class, the code reveals it is fetching a URL for a development environment:
`String string = this$0.getString(R.string.dev_env);`
- Checking the `strings.xml` file for the `dev_env` key reveals a second set of credentials embedded directly in a URL:
    
```xml
    <string name="dev_env">https://admin:password123@dev.infosecadventures.com</string>
```
    
    ![image.png](/img/img10.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 3. Firebase

### Objective

![image.png](/img/imag11.png)

### Solution

- By decompiling the APK and searching through `strings.xml`, I identified the Firebase URL used by the application:
    
```xml
    <string name="firebase_database_url">[https://allsafe-8cef0.firebaseio.com](https://allsafe-8cef0.firebaseio.com/)</string>
```
    
- Firebase databases are essentially JSON files. A common misconfiguration is leaving the database open to the public. To test this, I appended **`/.json`** to the end of the discovered URL: **`https://allsafe8cef0.firebaseio.com/.json`**
- The database returned a JSON object containing a secret flag and a hidden message:
    
    ![image.png](/img/imag12.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 4. Insecure Shared Preferences

- The application provides a user login portal that allows users to register and store their credentials
    
    ![image.png](/img/image7.png)
    
- By searching for the "Successful registration!" toast message in **JADX**, I identified the registration logic in the source code:
    
```bash
    SharedPreferences sharedpreferences = requireActivity().getSharedPreferences("user", 0);
    SharedPreferences.Editor editor = sharedpreferences.edit();
    editor.putString("username", username.getText().toString());
    editor.putString("password", password.getText().toString());
    editor.apply();
```
    
- The code reveals that the app uses the `SharedPreferences` API to store the username and password in a file named `user.xml`.
- After registering a test account (`username: wesam`, `password: test`), I examined the contents of the `user.xml` file:

```bash
cd /data/data/infosecadventures.allsafe/shared_prefs 
cat user.xml
```

- **Output:**
    
```xml
    <?xml version='1.0' encoding='utf-8' standalone='yes' ?>
    <map>
        <string name="password">test</string>
        <string name="username">wesam</string>
    </map>
```

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 5. SQL Injection

![image.png](/img/image8.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 6. Pin Bypass

### Objective

![image.png](/img/image9.png)

### Solution

- Opening the APK in JADX, the validation logic is inside `onCreateView$lambda$0`:
    
```java
    if (($pin.getText().toString().length() == 0) || 
        !this$0.checkPin($pin.getText().toString())) {
        // "Incorrect PIN, try harder!"
    } else {
        // "Access granted, good job!"
    }
```
    
    - The actual check is inside `checkPin()`:
- `checkPin()` decodes a hardcoded Base64 string and compares it against the user input. Decoding `NDg2Mw==` manually:  `echo "NDg2Mw==" | base64 -d`
The correct PIN is **4863**.

- Ignore that the pin is hardcoded in the code, and let's assume it's not in this case we have 2 scenarios to solve the challenge

---

#### Solution 1 — Force return value

- Hook `checkPin()` and always return `true` regardless of input:
    
```javascript
    Java.perform(function() {
        var cls = Java.use("infosecadventures.allsafe.challenges.PinBypass");
    
        cls.checkPin.implementation = function(pin) {
            console.log("[*] PIN entered: " + pin);
            return true;  // always pass
        };
    });
```
    
    - Any PIN entered → access granted.

---

### Solution 2 — Brute force

- We can brute force 4 digits code using frida through calling `checkPin()` with different values from 0000 - 9999 until it returns true.
- Stops at **4863** and prints the correct PIN.
    
```javascript
    Java.perform(function() {
        var cls = Java.use("infosecadventures.allsafe.challenges.PinBypass");
    
        cls.checkPin.implementation = function(pin) {
            for (var i = 0; i <= 9999; i++) {
                var attempt = String(i).padStart(4, '0');
                if (this.checkPin(attempt)) {
                    console.log("[*] Correct PIN: " + attempt);
                    break;
                }
            }
            return true;
        };
    });
```
    
    - `String(i)` — converts the integer `i` to a string since `checkPin()` expects a string parameter, not a number.
    - `padStart(4, '0')` = make the string exactly 4 characters long — if it's shorter, fill the missing characters from the left with `'0'`.