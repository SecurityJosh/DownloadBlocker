# Download Blocker

Chrome web store link: https://chrome.google.com/webstore/detail/download-blocker/kippogcnigegkjidkpfpaeimabcoboak

## What is it?

Download Blocker is a Google Chrome extension which blocks certain files from being downloaded, based on their extension / origin. It was created as a way to prevent HTML smuggling attacks, but it can also block downloads from webservers too.

HTML smuggling is essentially a technique for bypassing web-proxies / firewalls that detect executable content being downloaded from a server. It does this by using HTML5 APIs to provide a download purely using javascript, without making a request to a webserver. For an in-depth description of HTML smuggling, please see the references below.

## Configuration

This extension was created with enterprises in mind, so configuration isn't available to the end user. Instead, settings are applied via the 'Config' registry value under the following key:

`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy` (For Google Chrome)
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\kippogcnigegkjidkpfpaeimabcoboak\policy` (For Chromium Edge)

The 'Config' value is a JSON object with the following schema:

    {

        "rules" : [
            {
                "bannedExtensions" : [],
                "origin" : "local|server|any",
                exceptions : [
                    {
                        "type" : "hostname",
                        "value" : "example.com"		
                    }
                ]
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

### Banned Extensions

The bannedExtensions object supports an array containing either:
* The extensions to ban (Without the leading '.')
* The wildcard operator ("*") 

### Origin

* Local - The file was downloaded via javascript
* Server - The file is hosted via a web server
* Any - Either of the above

### Exceptions

Each rule object optionally supports exceptions via the **exceptions** array. Each exception is made up of a type and a value.

At the moment, the only valid type for an exception is "hostname". When downloading a file via JS, hostname is the hostname of the page the download was initiated from. When downloading via a server, it is the hostname of the download URL.

### Alerts

**alertConfig** is an optional object which contains a number of parameters used to send a HTTP request when a download is blocked. This can be used to ingest block data into a SIEM or other alert system.

Both URL and the values contained in the postData property can contain the following placeholders, which will be replaced with the actual alert data:
* {url}
* {fileUrl}
* {filename}
* {timestamp}

## Example Configuration

    {
        "rules" : [
            {
                "bannedExtensions" : ["*"],
                "origin" : "local"
            },

            {
                "bannedExtensions" : ["hta", "xbap"],
                "origin" : "any"
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
                "time": "{timestamp}"
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

## Enterprise Installation

[Chrome Policy](https://support.google.com/chrome/a/answer/187202?hl=en) / [Edge Policy](https://docs.microsoft.com/en-us/deployedge/configure-microsoft-edge) ADMX files required, or set the relevant registry key:

`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionSettings`
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\ExtensionSettings`

`Administrative Templates -> Google -> Google Chrome -> Extensions -> Extension management settings`

`Administrative Templates -> Microsoft Edge -> Extensions -> Extension management settings`

The following JSON will force-install the extension.

    {
        "kippogcnigegkjidkpfpaeimabcoboak": {
            "installation_mode": "force_installed",
            "update_url": "https://clients2.google.com/service/update2/crx",
            "runtime_blocked_hosts" : ["*://*"]
        }
    }

For Microsoft Edge on Windows, extensions from outside the Microsoft Extension Store can only be installed from a domain-joined / managed device system.

## Block Notification

Users are notified of their downloads being blocked via a browser notification:

![Block Notification](https://github.com/SecurityJosh/DownloadBlocker/raw/master/notification.png)

## Testing

The file test.html uses HTML smuggling to download a benign .hta file that opens calc.exe.

https://www.outflank.nl/demo/html_smuggling.html downloads a .doc file with a benign macro using a slightly different method of HTML smuggling. (Not hosted by me, contents not guaranteed!)

Both downloads should be blocked by the default configuration of the extension.

## References

* https://www.nccgroup.com/uk/about-us/newsroom-and-events/blogs/2017/august/smuggling-hta-files-in-internet-exploreredge/  
* https://outflank.nl/blog/2018/08/14/html-smuggling-explained/