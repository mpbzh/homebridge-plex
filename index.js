var request = require("request");
var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-plex", "Plex", Plex);
}

function Plex(log, config) {
    this.log = log;
    this.name = config["name"];
    this.plexToken = config["plex_token"];
    this.host = config["host"] || 'localhost';
    this.port = config["port"] || '32400';
    this.filter = config["filter"] || [];
    this.pollingInterval = config["polling_interval"] || 3;
    this.debug = config["debug"] || false;
    this.service = new Service.OccupancySensor(this.name);
    this.playing = false;

    this.service
        .getCharacteristic(Characteristic.OccupancyDetected)
        .on('get', this.getState.bind(this));

    var self = this;

    var callback = function (err, value) {
        setTimeout(function () {
            self.getState(callback);
        }, self.pollingInterval * 1000);

        if (err !== null)
            return;

        self.service
            .getCharacteristic(Characteristic.OccupancyDetected)
            .updateValue(value);
    };

    self.getState(callback);
}

Plex.prototype.getState = function (callback) {
    var self = this;

    if (self.debug)
        self.log("Getting current state...");

    request.get({
        url: "http://" + self.host + ":" + self.port + "/status/sessions",
        headers: {
            Accept: 'application/json',
            'X-Plex-Token': self.plexToken
        }
    }, function (err, response, body) {
        if (err || response.statusCode !== 200) {
            var statusCode = response ? response.statusCode : 1;
            self.log("Error getting state (status code %s): %s", statusCode, err);
            callback(err);
            return;
        }

        var data = JSON.parse(body);
        data = data.MediaContainer;
        var playing = false;

        if (data.size === 0) {
            if (self.debug)
                self.log('No active sessions on your server. Plex is not playing.');

            callback(null, false);
            return;
        }

        if (!self.debug);
        else if (data.size === 1)
            self.log('There is one active session:');
        else
            self.log('There are %s active sessions:', data.size);

        data.Metadata.forEach(function (e) {
            var player = e.Player.title;
            var user = e.User.title;
            var state = e.Player.state;

            var rulesMatch = true;
            var stateMatch = state === 'playing';
            if (stateMatch && player) {
                rulesMatch = false;
                self.filter.forEach(function (rule) {
                    if (self.debug) {
                        self.log("'" + rule.player + "' vs '" + player + "'")
                        self.log("'" + rule.user + "' vs '" + user + "'")
                    }
                    var playerMatch = !rule.player || rule.player.indexOf(player) > -1;
                    var userMatch = !rule.user || rule.user.indexOf(user) > -1;
                    rulesMatch = rulesMatch || playerMatch && userMatch;
                });
            }

            if (self.debug)
                self.log('→ %s [%s]: %s%s', user, player, state, rulesMatch ? '' : ' (ignored)');

            playing = playing || stateMatch && rulesMatch;

            if (self.debug || self.playing !== playing)
                self.log('Plex is %splaying.', (playing ? '' : 'not '));
        });

        self.playing = playing;
        callback(null, playing);
    });
}

Plex.prototype.getServices = function () {
    return [this.service];
}
