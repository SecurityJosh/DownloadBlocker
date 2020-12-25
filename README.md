# Download Blocker

## What is it?

Download Blocker is a Google Chrome extension which blocks certain files from being downloaded. It was created as a way to prevent HTML smuggling attacks, but it can also block downloads from webservers too.

HTML smuggling is essentially a technique for bypassing web-proxies / firewalls that detect executable content being downloaded from a server. It does this by using HTML5 APIs to provide a download without making a request to a webserver. For an in-depth description of HTML smuggling, please see the references below.

## Configuration

This extension was created with enterprises in mind, so configuration isn't available to the end user. Instead, settings are applied via the 'Config' registry value under the following key:

`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\bnabnnfebgikmgcipknmfkkiepekeopn\policy` (For Chromium Edge)
`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\bnabnnfebgikmgcipknmfkkiepekeopn\policy` (For Google Chrome)

The JSON data should be minified before setting the registry value, for example by using [this](https://codebeautify.org/jsonminifier) tool.

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
        "url" : "https://postman-echo.com/post",
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

When downloading a file via JS, hostname is the hostname of the page the download was initiated from. When downloading via a server, it is the hostname of the download URL.

The bannedExtensions object supports the wildcard operator ("*").

**alertConfig** is an optional object which contains a number of parameters used to send a HTTP request when a download is blocked. This can be used to ingest block data into a SIEM or other alert system.

Both URL and the values contained in the postData property can contain the following placeholders, which will be replaced with the actual alert data:
{url}
{fileUrl}
{filename}
{timestamp}

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
            "url" : "https://postman-echo.com/post",
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

## Block Notification

Users are notified of their downloads being blocked via a browser notification:

![Block Notification](notification.png)

## Testing

The file test.html uses HTML smuggling to download a benign .hta file that opens calc.exe.

https://www.outflank.nl/demo/html_smuggling.html downloads a .doc file with a benign macro using a slightly different method of HTML smuggling. (Not hosted by me, contents not guaranteed!)

Both downloads should be blocked by the default configuration of the extension.

## References

* https://www.nccgroup.com/uk/about-us/newsroom-and-events/blogs/2017/august/smuggling-hta-files-in-internet-exploreredge/  
* https://outflank.nl/blog/2018/08/14/html-smuggling-explained/