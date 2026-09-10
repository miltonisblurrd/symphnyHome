/**
 * Paste into script.google.com while signed into inspiredclosetslv@gmail.com
 * Triggers → Add trigger → processStowSalesOrders → Time-driven → Every 5 minutes.
 *
 * Only mail from noreply@thestowcompany.com with subject Order is sent.
 */
var WEBHOOK_URL = "https://www.symphny.xyz/api/inspired-closets/inbound/stow";
var WEBHOOK_SECRET = "PASTE_INSPIRED_CLOSETS_STOW_WEBHOOK_SECRET_HERE";
var PROCESSED_LABEL = "OS/Stow-sent";

function processStowSalesOrders() {
  var label = GmailApp.getUserLabelByName(PROCESSED_LABEL) || GmailApp.createLabel(PROCESSED_LABEL);
  var threads = GmailApp.search(
    "from:noreply@thestowcompany.com subject:Order has:attachment -label:" + PROCESSED_LABEL + " newer_than:21d",
  );

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (message.getFrom().toLowerCase().indexOf("thestowcompany.com") === -1) return;

      message.getAttachments().forEach(function (attachment) {
        var name = attachment.getName() || "order.pdf";
        if (!/\.pdf$/i.test(name)) return;

        var payload = {
          from: message.getFrom(),
          subject: message.getSubject() || "",
          filename: name,
          mime_type: "application/pdf",
          message_id: message.getId(),
          file_base64: Utilities.base64Encode(attachment.getBytes()),
        };

        var response = UrlFetchApp.fetch(WEBHOOK_URL, {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + WEBHOOK_SECRET },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });

        if (response.getResponseCode() >= 400) {
          throw new Error("Stow webhook " + response.getResponseCode() + ": " + response.getContentText());
        }
      });
    });
    thread.addLabel(label);
  });
}
