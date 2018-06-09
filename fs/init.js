load("api_config.js");
load("api_events.js");
load("api_gpio.js");
load("api_mqtt.js");
load("api_net.js");
load("api_sys.js");
load("api_timer.js");
load("api_dht.js");
load('api_aws.js');

let led = Cfg.get("pins.led");
let button = Cfg.get("pins.button");
let deviceTopic = "/devices/" + Cfg.get("device.id") + "/state";
let dht = DHT.create(4, DHT.DHT11);

print("LED GPIO:", led, "button GPIO:", button);

function updateState(newSt) {
    // if (newSt.on !== undefined) {
    //     state.on = newSt.on;
    // }
}

let getInfo = function() {
    return JSON.stringify({
        total_ram: Sys.total_ram(),
        free_ram: Sys.free_ram(),
        temp: dht.getTemp(),
        humi: dht.getHumidity()
    });
};

// Blink built-in LED every second
GPIO.set_mode(led, GPIO.MODE_OUTPUT);
Timer.set(
    1000 /* 1 sec */,
    Timer.REPEAT,
    function() {
        let value = GPIO.toggle(led);
        print(value ? "Tick" : "Tock", "uptime:", Sys.uptime(), getInfo());
    },
    null
);

Timer.set(
    60000 /* 60 sec */,
    Timer.REPEAT,
    function() {
        let message = getInfo();
        let ok = MQTT.pub(deviceTopic, message, 1);
        print("60s Published:", ok, deviceTopic, "->", message);
    },
    null
);

// Publish to MQTT topic on a button press. Button is wired to GPIO pin 0
GPIO.set_button_handler(
    button,
    GPIO.PULL_UP,
    GPIO.INT_EDGE_NEG,
    20,
    function() {
        let message = getInfo();
        let ok = MQTT.pub(deviceTopic, message, 1);
        print("Published:", ok, stateTopic, "->", message);
    },
    null
);

// Monitor network connectivity.
Event.addGroupHandler(
    Net.EVENT_GRP,
    function(ev, evdata, arg) {
        let evs = "???";
        if (ev === Net.STATUS_DISCONNECTED) {
            evs = "DISCONNECTED";
        } else if (ev === Net.STATUS_CONNECTING) {
            evs = "CONNECTING";
        } else if (ev === Net.STATUS_CONNECTED) {
            evs = "CONNECTED";
        } else if (ev === Net.STATUS_GOT_IP) {
            evs = "GOT_IP";
        }
        print("== Net event:", ev, evs);
    },
    null
);

// AWS Shadow Events

function reportState() {
    print("Reporting state:", JSON.stringify(state));
    AWS.Shadow.update(0, state);
}

AWS.Shadow.setStateHandler(function(ud, ev, reported, desired) {
    print("Event:", ev, "(" + AWS.Shadow.eventName(ev) + ")");
    if (ev === AWS.Shadow.CONNECTED) {
        reportState();
        return;
    }
    print("Reported state:", JSON.stringify(reported));
    print("Desired state:", JSON.stringify(desired));

    // mOS will request state on reconnect and deltas will arrive on changes.
    if (ev !== AWS.Shadow.GET_ACCEPTED && ev !== AWS.Shadow.UPDATE_DELTA) {
        return;
    }

    // Here we extract values from previosuly reported state (if any)
    // and then override it with desired state (if present).
    updateState(reported);
    updateState(desired);
    print("New state:", JSON.stringify(state));
    //applyHeater();
    if (ev === AWS.Shadow.UPDATE_DELTA) {
        reportState();
    }
}, null);
