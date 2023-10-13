## Change Log

## 1.0.6
* Fix for https://github.com/SecurityJosh/DownloadBlocker/issues/7
* The urlScheme filter would always look at the referring page, which makes sense for HTML Smuggled downloads but not for downloads from a web server. In this case the extension now takes the finalUrl value from the DownloadItem.

## 1.0.5
* Reverted blocking behavior to be consistent with versions 0.2.0 and prior. This means that downloads are, by default, now blocked as early as possible instead of waiting for the download to complete in order to give the Native Messaging Host change to obtain the file metadata. This change has been made because a user might have the chance to click a long-running download, meaning the item would automatically open when complete. This meant that the extension might not cancel and remove the download quickly enough to prevent it being opened. Rules now support the 'responsePriority' property which allows this behavior to be configured on a per-rule basis.

### 1.0.4
* Rules now support hostname, basedomain, referrerhostname and referrerbasedomain filters.

### 1.0.3
* The extension can now retrieve file metadata using a native messaging host. This allows metadata to be calculated in some situations which may otherwise not be possible. (e.g. Downloads smuggled via a document with a file:// origin, files downloaded from a web-server.)
* Implemented cleanup of session storage when it is no longer needed.
* Changes to how the referrer URL is inferred which will hopefully be more accurate.
* Fixed an issue with the injected content-script which could result in the webpage behaving unexpectedly in a specific situation.

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

### 0.1.4

* Fixed bug which meant that the injected content script wasn't removed from the DOM.
* Added the 'fileNameRegex' configuration filter to block downloads based on a specified filename pattern.
* The extension will now fall back to the default configuration if the managed config fails to parse correctly.
* Testing fix for error when a stale content script attempts communication with the extension after an extension upgrade.

### 0.1.3

* Added French language support (Thanks [InformatiqueOLLN](https://github.com/SecurityJosh/DownloadBlocker/pull/5/commits/3621b331596394e928ac312fdc33560a7981593b))

### 0.1.2

* Fixed a bug which meant that using the 'fileExtensions' exception type caused an error preventing the download from being processed correctly.
* The content script is better protected against tampering from a malicious webpage.
* The extension can now detect and block binary office documents which contain macros, if they have been HTML Smuggled.

    **N.B. Unless "Allow access to file URLs" has been enabled for the extension, macro detection will not work for downloads via a file:// origin.**

### 0.1.1
* Added the 'notify' rule action. Rules with this action will notify the end user, as well as optionally sending an external alert, however the download will not be blocked.
* Added the ability for the user-facing notification text to be customised by using the 'messageTemplate' property. This property can contain the same placeholders as the alert configuration. Applies to both 'block' and 'notify' rule actions.
* Similarly, the notification title can be changed using the 'titleTemplate' property.

### 0.1.0
* Added the 'action' rule property, which supports "audit" and "block" modes. In audit mode, the download is permitted and an external alert is sent, but no user notification is shown.
* Added 'state' and 'action' to the available metadata for alerting.
* The extension now gets the page URL via javascript where possible instead of inferring it from the currently active tab.

### 0.0.9
* The exceptions system now supports a 'fileExtensions' type, which supports allow-listing a set of file extensions. This can be used to block all but a few file extensions when bannedExtensions is set to ["*"].
* For HTML-Smuggled files only, a SHA256 hash of the file content is now available when sending alerts to an external server. 

  **N.B. In previous versions of this README, the example Chrome GPO configuration included a wildcard match for the runtime_blocked_hosts property. For the SHA256 field to be populated, the runtime_blocked_hosts property must be removed from the Chrome Extension GPO configuration.**

  **Additionally, for alerting to work when this wildcard runtime_blocked_hosts property exists, the host must be explicitly allowed via the runtime_allowed_hosts property.**

  **N.B. Unless "Allow access to file URLs" has been enabled for the extension, SHA256 hashes will not be available for downloads via a file:// origin.**

### 0.0.8
* The exceptions system now supports a 'basedomain' type, which supports allow-listing a domain and its sub-domains.