package app.lyve.android;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super so the Play Billing bridge exists on first load.
        registerPlugin(LyveBilling.class);
        super.onCreate(savedInstanceState);
    }
}
