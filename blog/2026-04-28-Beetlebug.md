---
slug: Beetlbug-Firebase
title: Beetlbug - Firebase
authors: [wesam]
date: 2026-05-08
---
{/* truncate */}
### Objective:

![image.png](/img/img4.png)

Identify and exploit a misconfigured Firebase Realtime Database to extract the hidden flag.

### Steps:

- **Decompile:** Used **JADX** to decompile the APK and began auditing the source code for Firebase configurations.
- **Identify URL:** Located the hardcoded Firebase database URL within `res/values/strings.xml`:
    
    `https://beetlebug-374fc-default-rtdb.firebaseio.com/`
    
- **Verify Access:** Tested for public read permissions by appending **`/.json`** to the URL in a browser, forcing the server to return the database tree in JSON format.
- **Extract Flag:** Successfully bypassed authentication due to misconfigured security rules and captured the flag: **`0x3365A10`**.
    
    ![image.png](/img/img5.png)