# Download Blocker

Chrome web store link: https://chrome.google.com/webstore/detail/download-blocker/kippogcnigegkjidkpfpaeimabcoboak

## What is it?

Download Blocker is a Google Chrome extension which blocks certain files from being downloaded, based on a number of different data / metadata properties. It was created as a way to prevent HTML smuggling attacks, but it can also block downloads from webservers too.

HTML smuggling is essentially a technique for bypassing web-proxies / firewalls that perform content inspection on files downloaded from a server. It does this by using HTML5 APIs to provide a client-side download using javascript, without making a request to a webserver. For an in-depth description of HTML smuggling, please see the references below.

## Change Log

### 1.0.2
* Metadata support added for downloads initiated from inside an iFrame.
* fileInspectionData now contains a new key, 'zipFileNames', which contains an array of all of the filenames contained within a .zip file.
* Fixed a bug which meant that the calculated SHA256 for base64-encoded data URIs could be incorrect.

### 1.0.1
* Added {formattedTimestamp}, {eventTimestamp} and {formattedEventTimestamp} placeholders.
* Added {hostname} and {username} placeholders (Extra configuration required)
* If a managed configuration fails to parse, a user notification will now be displayed and the extension will fall back to the default config.

### 1.0.0
* Fixed bug which meant the the 'referrerbasedomain' exception type did not function as expected.

### 0.2.2
* Fixed bug which meant a download matching an audit rule with no alertConfig set would not generate a notification when blocked.
* Fixed bug which meant the the 'referrerbasedomain' and 'referrerhostname' exception types did not function as expected.

### 0.2.1
* Updated minimum Chrome version in manifest to 102

### 0.2.0
* Migrated the extension to MV3.

### 0.1.8
* Smuggled files which are delivered via iframes with data: URLs are now content-inspected and will have their file-hash calculated.

### 0.1.7
* Fixed bug which meant that when exceptions of non-smuggled downloads were being checked, it was the referrer URL that was being checked instead of the download URL.
* Added the 'referrerhostname' and 'referrerbasedomain' exception types in-case this behavior is desireable.

### 0.1.6
* The 'hostname' and 'basedomain' exception types now support arrays as well as strings.
* Fixed bug which meant that only the first exception in a rule was actually checked.
* Fixed issue which meant that base64 encoded data:// URLs would not be processed for SHA256 calculation or file inspection.
* Rewrote how file metadata (SHA256, file inspection data) is handled which means that this information can trigger a rule action even if it is received after the file has finished downloading.
* The {timestamp} placeholder now uses the time the download was initiated instead of the time the alert notification was sent.

### 0.1.5
* Fixed bug which meant an empty response from the server when sending an alert was handled as an error.
* Added 'ruleName' config parameter to aid identifying which rule triggered an action.
* Fixed parameters not being encoded properly when used in an alert URL.
* Added the 'urlScheme' configuration filter to block downloads based on the URL scheme of the referring page. (e.g. file, http, https)
* Fix for an oversight which may have caused the inferred URL to take precedence over the one provided by the webpage. (See 0.1.0)

Full change log available [here](CHANGELOG.md)

## Configuration

This extension was created with enterprises in mind, so configuration isn't available to the end user. Instead, settings are applied via the 'Config' registry value under the following key:

`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy` (For Google Chrome)
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy` (For Chromium Edge)

![Registry Configuration - Chrome](https://github.com/SecurityJosh/DownloadBlocker/raw/master/registry_chrome.png)

The 'Config' value is a JSON object with the following schema:

    {
        "rules" : [
            {
                ruleName : ""
                "bannedExtensions" : [],
                "urlScheme" : ["file", "http", "https", "etc."],
                "fileNameRegex" : "",
                "origin" : "local|server|any",
                fileInspection: {"InspectionType": [true|false]},
                "exceptions" : [
                    {
                        "type" : "hostname|baseDomain|fileExtensions",
                        "value" : "example.com"		
                    }
                ],
                "action" : "audit|block|notify",
                "titleTemplate" : "Notification Title",
                "messageTemplate" : "Notification message"
            }
        ],

        "alertConfig" : {
            "url" : "",
            "headers" : {},
            "method" : "GET|POST",
            "sendAsJson" : true|false,
            "postData" : {}
        }   
    }

The JSON data should be minified before setting the registry value, for example by using [this](https://codebeautify.org/jsonminifier) tool.

**Note: It can take a while for Chrome to apply an updated policy. For testing purposes, you may need to go to chrome://policy or edge://policy to check if the policy has been loaded. You can also manually reload the policies via the 'Reload Policies' button. Note that Edge doesn't appear to display extension configuration settings, but they are actually still loaded.**

### Banned Extensions (Required)

The bannedExtensions property supports an array containing either:
* The extensions to ban (Without the leading '.')
* The wildcard operator ("*")

### Origin (Required)

Property name: origin

* Local - The file was downloaded via javascript
* Server - The file is hosted via a web server
* Any - Either of the above

### ruleName (Optional)

The ruleName property is simply an identifier which can be used in the alert config or message template fields. It's useful to help pinpoint which rule has triggered.

### urlScheme (Optional)

Property name: urlScheme (Array)

This property is intended to used in combination with an origin = Local filter. When used in this way, the urlScheme filter can be used to block downloads based on their url protocol, e.g file, http, https etc..

This can be used, for example, to block all HTML Smuggled downloads which originate from a local webpage on the user's computer. (e.g. via an email attachment) Since Chrome can't, by default, run content scripts in these local webpages, a rule which blocks files based on content inspection won't work for these files. This property allows you to blanket ban these files which can't be inspected.


### fileNameRegex (Optional)

Property name: fileNameRegex

The fileNameRegex property allows you to filter for file names that match a given regex pattern. The pattern is tested against the whole file name, including extension. Be aware that you will need to double-escape any backslashes in your regex string so that the JSON remains valid.

### Action (Optional, default = block)

Property name: action

| Action Type     | Is the download blocked?         | Is the user notified?    | HTTP Alert Sent (If configured) |
|-----------------|----------------------------------|--------------------------|---------------------------------|
| block (default) | Yes                              | Yes                      | Yes                             |
| audit           | No *                             | No *                     | Yes                             |
| notify          | No                               | Yes                      | Yes                             |

\* If audit mode is chosen, but no alert config is present, the extension will revert back to block mode.

If multiple rules are matched, the first block rule takes precedence. An audit or notify rule will only be used if no block rules are matched.

### File Inspection (Optional)

Property name: fileInspection

For files which are created using HTML Smuggling, the extension can inspect them for certain properties. Additionally, rules can be configured to look for these properties in smugged files.

If multiple inspection types are specified, all values must match for the rule to match.

| Inspection Type | Description                                                                                              | Example 'fileInspection' config value  |
|-----------------|----------------------------------------------------------------------------------------------------------|----------------------------------------|
| macros          | True if the file is a binary office file (i.e. .docm .ppt, .xls) and contains macros or Excel 4.0 macros.| {"macros" : "true"}                    |
| zipFileNames    | An array of all of the filenames contained within the zip file. Empty if the file is not a zip file.     | N/A                                    |


### Exceptions (Optional)

Property name: exceptions

Each rule object optionally supports exceptions via the **exceptions** array. Each exception is made up of a type and a value.

| Exception Type     | Description                                 | Expected Type                                                | Example Value                   |
|--------------------|---------------------------------------------|--------------------------------------------------------------|---------------------------------|
| hostname           | Exact Hostname match                        | String (< 0.1.6)<br>String or Array of strings (>= 0.1.6)    | "specificsubdomain.example.com"<br>["a.example.com", "b.example.com"]        |
| basedomain         | Hostname and any subdomain match            | String (< 0.1.6)<br>String or Array of strings (>= 0.1.6)    | "example1.com"<br>["example1.com", "example2.com"]                |
| fileExtensions     | File extensions match                       | Array of strings                                             | ["txt", "csv"]                  |
| referrerhostname   | Exact Hostname match (Referrer)             | String or Array of strings   | "specificsubdomain.example.com"<br>["a.example.com", "b.example.com"] |
| referrerbasedomain | Hostname and any subdomain match (Referrer) | String or Array of strings   | "example1.com"<br>["example1.com", "example2.com"]                |

When downloading a file via JS, hostname is the hostname of the page the download was initiated from. When downloading via a server, it is the hostname of the download URL.

### titleTemplate and messageTemplate (Optional)

The **titleTemplate** and **messageTemplate** properties allow you to customise the toast notification sent to the user when a user is notified of a download or a download block. It supports the same template strings as the alert URL / post data (See below).

### Alerts (Optional)

*alertConfig is a global setting, not a per-rule setting.*

**alertConfig** is an optional object which contains a number of parameters used to send a HTTP request when a download is blocked. This can be used to ingest block data into a SIEM or other alert system. For example, you can set up a web hook using [IFTTT](https://securityjosh.github.io/2022/09/09/HTML-Smuggling-Email-Notifications.html) and have it capture alert information and send you an email when triggered.

| Property   | Description                                                                               | Expected Type / Value | Example Value |
|------------|-------------------------------------------------------------------------------------------|-----------------------|---------------|
| url        | Request URL                                                                               | String                |               |
| headers    | Request headers (E.G. an API Key)                                                         | Dictionary            |               |
| method     | Request method                                                                            | GET or POST           | POST          |
| sendAsJson | Applies to POST requests only.<br><br>If true, the request body is sent as JSON with content type application/json.<br><br>Otherwise, it's sent as application/x-www-form-urlencoded                                                                                    | Boolean               | true          |
| postData   | The data to send with the request                                                         | Dictionary            |           |
 
Both the URL and the values contained in the postData property can contain the following placeholders, which will be replaced with the actual alert data:
* {url} (Page URL for smuggled files, referrer URL for non-smuggled files)
* {fileUrl} (data: / blob: URL for smuggled files, file URL for non-smuggled files)
* {filename}
* {timestamp} (Numeric timestamp of when the download was initiated)
* {formattedTimestamp} (Formatted timestamp of when the download was initiated)
* {eventTimestamp} (Numeric timestamp of when the download was detected / blocked)
* {formattedEventTimestamp} (Formatted timestamp of when the download was detected / blocked)
* {ruleName}
* {state} (Download state)
* {action} (Rule action: block, audit or notify)
* {sha256} (Only for HTML Smuggled downloads)
* {fileInspection} (Only for HTML Smuggled downloads)
* {hostname} *
* {username} *

\* **Environmental Placeholders Configuration**

To aid with investigations, the extension can also include the device hostname / username when sending alerts. To do this, further registry configuration is required, since this information isn't directly available to Chromium extensions.

*Hostname Placeholder*

`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy\Hostname` (For Google Chrome)  
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy\Hostname` (For Chromium Edge)

*Username Placeholder*

`HKEY_CURRENT_USER\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy\Username` (For Google Chrome)  
`HKEY_CURRENT_USER\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy\Username` (For Chromium Edge)

The easiest way to automatically set these values in a domain-joined environment is to use Group Policy Preferences to configure the relevant registry values. Make sure to use User Configuration rather than Computer Configuration, otherwise the username will not resolve properly.

![GPO Configuration](GPO.png)

When the GPOs apply, the environment variables will resolve and the resgistry values will be set with the relevant information:

![Registry - Hostname](HostnameRegistryView.PNG)
![Registry - Username](UsernameRegistryView.PNG)  

## Example Configuration

    {
        "rules" : [
            {
                "bannedExtensions" : ["*"],
                "origin" : "local",
                "action": "audit"
            },

            {   
                "bannedExtensions" : ["doc", "ppt", "xls"],
                "origin" : "local",
                "fileInspection": {"macros": true}
            },

            {
                "bannedExtensions" : ["hta", "xbap"],
                "origin" : "any",
                "action": "block"
            }
	    ],

        "alertConfig" : {
            "url" : "https://siem/ingest",
            "headers" : {},
            "method" : "POST",
            "sendAsJson" : true,
            "postData" : {
                "filename" : "{filename}",
                "fileUrl" : "{fileUrl}",
                "url" : "{url}",
                "sha256" : "{sha256}",
                "time": "{timestamp}",
                "ruleName" : "{ruleName}",
                "action": "{action}",
                "state" : "{state}",
                "fileInspection" : "{fileInspection}",
                "username" : "{username}",
                "hostname" : "{hostname}",
            }
        } 
    }

## Default Configuration

If no configuration file is present at the location given above, the following configuration will apply:

    {
        "rules" : [
            {
                "bannedExtensions" : ["*"],
                "origin" : "local"
            }
        ]
    }

## Enterprise Configuration

[Chrome Policy](https://support.google.com/chrome/a/answer/187202?hl=en) / [Edge Policy](https://docs.microsoft.com/en-us/deployedge/configure-microsoft-edge) ADMX files required, or set the relevant registry key:

`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionSettings`
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\ExtensionSettings`

`Administrative Templates -> Google -> Google Chrome -> Extensions -> Extension management settings`

`Administrative Templates -> Microsoft Edge -> Extensions -> Extension management settings`

The following JSON will force-install the extension and prevent users from disabling or uninstalling it.

    {
        "kippogcnigegkjidkpfpaeimabcoboak": {
            "installation_mode": "force_installed",
            "update_url": "https://clients2.google.com/service/update2/crx"
        }
    }

You will need to minify this JSON. [This](https://mythic-byway-180716.appspot.com/) tool allows you you validate and minify your chrome policy JSON.

For Microsoft Edge on Windows, extensions from outside the Microsoft Extension Store can only be force-installed from a domain-joined / managed device system.

## End User Notification

When the triggering rule action is set to block or notify, users will received a browser notification when a download is detected / blocked:

![Block Notification](https://github.com/SecurityJosh/DownloadBlocker/raw/master/notification.png)

## Testing

The file test.html uses HTML smuggling to download a benign .hta file that opens calc.exe.

https://www.outflank.nl/demo/html_smuggling.html downloads a .doc file with a benign macro using a slightly different method of HTML smuggling. (Not hosted by me, contents not guaranteed!)

Both downloads should be blocked by the default configuration of the extension.

## References

* https://www.nccgroup.com/uk/about-us/newsroom-and-events/blogs/2017/august/smuggling-hta-files-in-internet-exploreredge/  
* https://outflank.nl/blog/2018/08/14/html-smuggling-explained/
