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
    this.pollingInterval = config["pollingInterval"] || 2;
    this.service = new Service.OccupancySensor(this.name);
 		 
    this.service
        .getCharacteristic(Characteristic.OccupancyDetected)	
        .on('get', this.getState.bind(this));	
    
    var self = this;
    self.pollingStatus = function(){
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
                return;
            }

            var data = JSON.parse(body);
            data = data.MediaContainer;
            var playing = false;

            if (data.size === 0) {
                // self.log('No active sessions on your server. Plex is not playing.');
                self.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(false);
                setTimeout(function(){
                    self.pollingStatus()
                }, self.pollingInterval*1000)
                return;
            }
            var playing = false;
            data.Video.forEach(function (e) {
                var player = e.Player.title;
                var user = e.User.title;
                var state = e.Player.state;

                var rulesMatch = true;
                var stateMatch = state === 'playing';

                if (stateMatch && player) {
                    rulesMatch = false;
                    self.filter.forEach(function (rule) {
                        var playerMatch = !rule.player || rule.player.indexOf(player) > -1;
                        var userMatch = !rule.user || rule.user.indexOf(user) > -1;
                        if (playerMatch && userMatch)
                            rulesMatch = true;
                    });
                }

                var matchStr = rulesMatch ? '' : ' (ignored)';
                // self.log('→ %s [%s]: %s%s', user, player, state, matchStr);

                if (stateMatch && rulesMatch)
                    playing = true;
                
                // self.log('Plex is %splaying.', (playing ? '' : 'not '));
            })
            if (playing) {
                self.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(true);
            } else {
                self.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(false);
            }
            setTimeout(function(){
                self.pollingStatus()
            }, self.pollingInterval*1000)
            })

    }
    self.pollingStatus();
}

Plex.prototype.getState = function (callback) {
    this.log("Getting current state...");

    request.get({
        url: "http://" + this.host + ":" + this.port + "/status/sessions",
        headers: {
            Accept: 'application/json',
            'X-Plex-Token': this.plexToken
        }
    }, function (err, response, body) {
        if (err || response.statusCode !== 200) {
            var statusCode = response ? response.statusCode : 1;
            this.log("Error getting state (status code %s): %s", statusCode, err);
            callback(err);
            return;
        }

        var data = JSON.parse(body);
        data = data.MediaContainer;
        var playing = false;

        if (data.size === 0) {
            this.log('No active sessions on your server. Plex is not playing.');
            callback(null, false);
            return;
        }

        if (data.size === 1)
            this.log('There is one active session:');
        else
            this.log('There are %s active sessions:', data.size);

        data.Video.forEach(function (e) {
            var player = e.Player.title;
            var user = e.User.title;
            var state = e.Player.state;

            var rulesMatch = true;
            var stateMatch = state === 'playing';
            var self = this
            if (stateMatch && player) {
                rulesMatch = false;
                this.filter.forEach(function (rule) {
                    self.log(rule.player + " vs " + player)
                    self.log(rule.user + " vs " + user)
                    var playerMatch = !rule.player || rule.player.indexOf(player) > -1;
                    var userMatch = !rule.user || rule.user.indexOf(user) > -1;
                    if (playerMatch && userMatch)
                        rulesMatch = true;
                });
            }

            var matchStr = rulesMatch ? '' : ' (ignored)';
            this.log('→ %s [%s]: %s%s', user, player, state, matchStr);

            if (stateMatch && rulesMatch) playing = true;

            this.log('Plex is %splaying.', (playing ? '' : 'not '));
            
        }.bind(this));
        callback(null, playing);
    }.bind(this));
}

Plex.prototype.getServices = function () {
    return [this.service];
}
