#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LyveIAP, "LyveIAP",
  CAP_PLUGIN_METHOD(products, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(restore, CAPPluginReturnPromise);
)
