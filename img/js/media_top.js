/************************************************************************************************************************
 * 抽象メディアインターフェース
 ************************************************************************************************************************/

window.Media = (function() {

    var Media = function(src, option) {
        this.src = src;
        this.media = null;

        this.$volume = $('<p></p>').css({
            top: 0
        });

        if (option.volume !== undefined) {
            this.defaultVolume = option.volume;
        } else {
            this.defaultVolume = 100;
        }
    };

    Media.extends = function(subConstructor) {
        if (typeof Object.create !== 'function') {
            Object.create = function(o) {
                var F = function() {};
                F.prototype = o;
                return new F();
            };
        }
        subConstructor.prototype = Object.create(Media.prototype);
        subConstructor.prototype.constructor = subConstructor;
        subConstructor.prototype.__super__ = Media.prototype;
        subConstructor.prototype.__super__.constructor = Media;
        subConstructor.prototype['super'] = function() {
            this.__super__.constructor.apply(this, arguments);
        };
        return subConstructor;
    };

    Media.prototype.load = function(onprogress) {
        var def = new jQuery.Deferred();
        var xhr = new XMLHttpRequest();
        var self = this;

        xhr.onload = function(e) {
            if (self.media) {
                self.media.src = self.src;
            }
            def.resolve();
        };

        xhr.onerror = function() {
            def.resolve();
        };

        xhr.onprogress = onprogress;

        xhr.open('GET', this.src);
        xhr.send();

        return def.promise();
    };


    Media.prototype.play = function() {
        this.media.play();
    };

    Media.prototype.pause = function() {
        this.media.pause();
    };

    Media.prototype.mute = function() {
        this.fadeMute(0);
    };

    Media.prototype.unmute = function() {
        this.fadeUnmute(0);
    };

    Media.prototype.seek = function(sec) {
        if (this.media) {
            if (sec === undefined) sec = 0;
            this.media.currentTime = sec;
        }
    };

    Media.prototype.setVolume = function(val) {
        if (this.media) {
            this.media.volume = val / 100;
        }
    };


    // 音量をフェードさせながら再生開始
    Media.prototype.fadeStart = function(duration) {
        this.media.volume = 0;
        this.media.play();

        var media = this.media;

        var step = function(v) {
            media.volume = v / 100;
        };

        this.$volume.stop().css({
            top: 0
        }).animate({
            top: this.defaultVolume
        }, {
            duration: duration,
            easing: 'linear',
            step: step
        });
    };

    // 音量をフェードさせながら再生停止
    Media.prototype.fadePause = function(duration) {
        var media = this.media;

        var step = function(v) {
            media.volume = v / 100;
        };

        var complete = function() {
            media.pause();
        };

        this.$volume.stop().animate({
            top: 0
        }, {
            duration: duration,
            easing: 'linear',
            step: step,
            complete: complete
        });
    };


    // 音量をフェードさせながらミュート
    Media.prototype.fadeMute = function(duration) {
        var media = this.media;

        var step = function(v) {
            media.volume = v / 100;
        };
        var complete = function() {
            media.muted = true;
        };

        this.$volume.stop().animate({
            top: 0
        }, {
            duration: duration,
            easing: 'linear',
            step: step,
            complete: complete
        });
    };

    // 音量をフェードさせながらミュート解除
    Media.prototype.fadeUnmute = function(duration) {
        this.media.muted = false;

        var media = this.media;

        var step = function(v) {
            media.volume = v / 100;
        };
        this.$volume.stop().css({
            top: 0
        }).animate({
            top: this.defaultVolume
        }, {
            duration: duration,
            easing: 'linear',
            step: step
        });
    };

    Media.prototype.onEnded = function(callback) {
        this.media.addEventListener('ended', callback, false);
    };

    Media.prototype.onPause = function(callback) {
        this.media.addEventListener('pause', callback, false);
    };

    Media.prototype.onTimeupdate = function(callback) {
        this.media.addEventListener('timeupdate', function(e) {
            callback({
                currentTime: e.target.currentTime * 1000,
                duration: e.target.duration * 1000
            });
        }, false);
    };

    Media.prototype.beforeEnd = function(msec, callback) {
        var fired = false;

        this.onTimeupdate(function(param) {
            if (param.currentTime > param.duration - msec) {
                if (!fired) {
                    fired = true;
                    callback();
                }
            } else {
                fired = false;
            }
        });
    };


    return Media;

})();


/************************************************************************************************************************
 * ローディング管理
 ************************************************************************************************************************/

window.Loader = (function() {

    var Loader = function() {
        this.loadables = [];
    };

    Loader.prototype.addMedia = function(media) {
        this.loadables.push(media);
    };

    Loader.prototype.start = function(progress) {
        var total = [];
        var loaded = [];
        var promises = [];
        var length = this.loadables.length;

        this.loadables.forEach(function(media, i) {

            promises.push(media.load(function(e) {
                total[i] = e.total;
                loaded[i] = e.loaded;

                if (total.length === length) {
                    var t = 0;
                    var l = 0;
                    for (var j = 0; j < total.length; j++) t += total[j];
                    for (var j = 0; j < loaded.length; j++) l += loaded[j];

                    // 進捗コールバック
                    if (progress) progress(l / t);
                }
            }));

        }, this);

        return jQuery.when.apply(this, promises);
    };

    return Loader;
})();



/************************************************************************************************************************
 * 音量管理
 ************************************************************************************************************************/

window.MediaManager = (function() {

    var MediaManager = function() {

        this.off = Polaris.cookie.read('sound-off', false);

        this.media = [];

        if (Polaris.ua.tablet || Polaris.ua.mobile || Polaris.ua.nwiiu) {
            this.off = true;
        }


        $(document).on('click', '#h_sound .h_sound_on', (function(_this) {
            return function(e) {
                e.preventDefault();
                _this.off = false;
                _this.update(true);
            };
        })(this));

        $(document).on('click', '#h_sound .h_sound_off', (function(_this) {
            return function(e) {
                e.preventDefault();
                _this.off = true;
                _this.update(true);
            };
        })(this));
    };


    MediaManager.prototype.addMedia = function(media) {
        this.media.push(media);
        this.update();
    };


    MediaManager.prototype.mute = function() {
        for (var i = 0; i < this.media.length; i++) {
            this.media[i].mute();
        }
    };

    MediaManager.prototype.unmute = function() {
        for (var i = 0; i < this.media.length; i++) {
            this.media[i].unmute();
        }
    };

    MediaManager.prototype.update = function(click) {
        $('#h_sound').find('.h_sound_on, .h_sound_off').removeClass('current');

        Polaris.cookie.write('sound-off', this.off, {
            path: '/zelda/'
        });

        if (this.off) {
            $('#h_sound .h_sound_off').addClass('current');
            this.mute();
        } else {
            $('#h_sound .h_sound_on').addClass('current');
            this.unmute();

            // 音声再生開始
            if (click) {
                for (var i = 0; i < this.media.length; i++) {
                    if (this.media[i] instanceof Sound && !this.media[i].ended) {
                        this.media[i].play();
                    }
                }
            }
        }
    };


    return MediaManager;
})();


/************************************************************************************************************************
 * 動画再生
 ************************************************************************************************************************/

window.Movie = (function() {

    var Movie = Media.extends(function(src, option) {

        this.super(src, option);

        this.media = document.createElement('video');

        $(option.container).append(this.media);

        this.el = $(this.media);

        this.media.loop = !!option.loop;


        if (option.center) {
            Polaris.util.onResize((function(_this) {
                return function(w, h) {
                    var ww = Math.max(w, 960);
                    var wh = Math.max(h, 768) - 40;

                    var aspect = 9 / 16;

                    var vw = ww / 2 / (0.5 - Math.abs(option.center.x - 0.5));
                    var mx = Math.min(ww - vw, 0);

                    var vh = wh / 2 / (0.5 - Math.abs(option.center.y - 0.5));
                    var my = Math.min(wh - vh, 0);

                    if (vw * aspect >= vh) {
                        vh = vw * aspect;
                        my = wh / 2 - vh * option.center.y;
                    } else {
                        vw = vh / aspect;
                        mx = ww / 2 - vw * option.center.x;
                    }

                    _this.el.css({
                        top: my,
                        left: mx,
                        width: vw,
                        height: vh,
                    });
                };
            })(this));
        }
    });

    Movie.prototype.skipLoad = function() {
        this.media.src = this.src;
    };

    return Movie;
})();



/************************************************************************************************************************
 * 音声再生
 ************************************************************************************************************************/

window.Sound = (function() {

    var Sound = Media.extends(function(src, option) {

        this.super(src, option);

        this.media = new Audio();

        this.ended = false;

        this.media.loop = !!option.loop;

        if (Polaris.ua.ios) {
            this.muted = false;
        }

        this.media.addEventListener('ended', (function(_this) {
            return function() {
                _this.ended = true;
            }
        })(this));
    });

    // iOSのバグ対策
    Sound.prototype.mute = function() {
        if (Polaris.ua.ios) {
            this.media.pause();
            this.muted = true;
        } else {
            this.media.muted = true;
        }
    };

    // iOSのバグ対策
    Sound.prototype.unmute = function() {
        if (Polaris.ua.ios) {
            this.media.play();
            this.muted = false;
        } else {
            this.media.muted = false;
        }
    };

    Sound.prototype.resume = function() {
        if (!this.ended) {
            if (Polaris.ua.ios) {
                if (!this.muted) {
                    this.media.play();
                }
            } else {
                this.media.play();
            }
        }
    };

    return Sound;

})();




/************************************************************************************************************************
 * Youtube再生
 ************************************************************************************************************************/

window.Youtube = (function() {

    var Youtube = function() {

        var def = new jQuery.Deferred();

        window.onYouTubeIframeAPIReady = function() {
            def.resolve();
        };

        jQuery.ajax({
            dataType: 'script',
            url: 'https://www.youtube.com/iframe_api'
        });

        this.ready = def.promise();
    };

    Youtube.prototype.create = function(id, option) {
        return new YoutubePlayer(id, option, this.ready);
    };

    return Youtube;

})();

/************************************************************************************************************************
 * Youtube再生
 ************************************************************************************************************************/

window.Youtube = (function() {

    var Youtube = function() {

        var def = new jQuery.Deferred();

        window.onYouTubeIframeAPIReady = function() {
            def.resolve();
        };

        jQuery.ajax({
            dataType: 'script',
            url: 'https://www.youtube.com/iframe_api'
        });

        this.ready = def.promise();
    };

    Youtube.prototype.create = function(id, option) {
        return new YoutubePlayer(id, option, this.ready);
    };

    return Youtube;

})();

var YoutubePlayer = (function() {

    var Player = Media.extends(function(src, option, apiReady) {

        var uid = Polaris.util.unique(10);

        var def = new jQuery.Deferred();

        var self = this;

        this.super(src, option);

        this.container = $(option.container);

        this.container.append('<div class="ytvideo"><div id="' + uid + '"></div></div>');

        this.el = $('#' + uid).parent();

        this.ready = def.promise();

        // 再生状態
        this.state = -1;

        // 終了リスナー
        this.endListeners = [];

        // 再生リスナー
        this.updateListeners = [];

        // 一時停止リスナー
        this.pauseListeners = [];


        apiReady.then(function() {

            self.media = new YT.Player(uid, {
                videoId: src,
                width: option.width,
                height: option.height,
                playerVars: {
                    showinfo: 0,
                    controls: option.controls ? 1 : 0,
                    loop: option.loop ? 1 : 0,
                    rel: 0,
                    vq: option.vq ? option.vq : 'hd720',
                    wmode: 'transparent'
                },
                events: {
                    onReady: function() {
                        self.media.setPlaybackQuality(option.vq ? option.vq : 'hd720');
                        def.resolve();
                    },
                    onStateChange: function(e) {
                        self.state = e.data;

                        if (e.data === 0 && option.loop) {
                            self.media.playVideo();
                        }

                        if (e.data === 0) {
                            self.endListeners.forEach(function(callback) {
                                callback();
                            });
                        }
                        if (e.data === 2) {
                            self.pauseListeners.forEach(function(callback) {
                                callback();
                            });
                        }
                        if (e.data === 1) {
                            if (!option.controls) {
                                self.media.setPlaybackQuality(option.vq ? option.vq : 'hd720');
                            }
                        }
                    },
                    onPlaybackQualityChange: function(e) {}
                }
            });

            if (option.volume !== undefined) {
                self.setVolume(option.volume);
            }

            if (option.center) {
                Polaris.util.onResize(function(w, h) {
                    var ww = Math.max(w, 960);
                    var wh = Math.max(h, 768) - 40;

                    var aspect = 9 / 16;

                    var vw = ww / 2 / (0.5 - Math.abs(option.center.x - 0.5));
                    var mx = Math.min(ww - vw, 0);

                    var vh = wh / 2 / (0.5 - Math.abs(option.center.y - 0.5));
                    var my = Math.min(wh - vh, 0);

                    if (vw * aspect >= vh) {
                        vh = vw * aspect;
                        my = wh / 2 - vh * option.center.y;
                    } else {
                        vw = vh / aspect;
                        mx = ww / 2 - vw * option.center.x;
                    }

                    self.el.css({
                        top: my,
                        left: mx,
                        width: vw,
                        height: vh,
                    });
                });
            }

            // 
            setInterval(function() {
                if (self.state === 1) {
                    self.updateListeners.forEach(function(callback) {
                        callback({
                            currentTime: self.media.getCurrentTime() * 1000,
                            duration: self.media.getDuration() * 1000
                        });
                    });
                }
            }, 200);
        });
    });


    Player.prototype.load = function(onprogress) {
        var def = new jQuery.Deferred();
        var self = this;

        if (onprogress) {
            var index = 0;

            var timer = setInterval(function() {

                onprogress({
                    total: 10000,
                    loaded: (++index) * 1000
                });

                if (index === 10) {
                    self.ready.then(function() {
                        def.resolve();
                    });
                    clearInterval(timer);
                }
            }, 300);
        } else {
            self.ready.then(function() {
                def.resolve();
            });
        }
        return def.promise();
    };

    Player.prototype.skipLoad = function() {};


    Player.prototype.seek = function(sec) {
        if (sec === undefined) sec = 0;

        this.ready.then((function(_this) {
            return function() {
                _this.media.seekTo(sec);
            };
        })(this));
    };

    Player.prototype.play = function() {
        var self = this;

        this.ready.then(function() {
            self.media.playVideo();
        });
    };

    Player.prototype.pause = function() {
        var self = this;

        this.ready.then(function() {
            self.media.pauseVideo();
        });
    };

    Player.prototype.fadeStart = function(duration) {
        var self = this;

        this.ready.then(function() {
            self.media.playVideo();
            self.media.setVolume(0);

            var step = function(v) {
                self.media.setVolume(v);
            };
            self.$volume.stop().css({
                top: 0
            }).animate({
                top: self.defaultVolume
            }, {
                duration: duration,
                easing: 'linear',
                step: step
            });
        });
    };

    Player.prototype.fadePause = function(duration) {
        var self = this;

        this.ready.then(function() {
            var step = function(v) {
                self.media.setVolume(v);
            };
            var complete = function() {
                self.media.pauseVideo();
            };
            self.$volume.stop().animate({
                top: 0
            }, {
                duration: duration,
                easing: 'linear',
                step: step,
                complete: complete
            });
        });
    };

    Player.prototype.mute = function() {
        var self = this;

        this.ready.then(function() {
            self.media.mute();
        });
    };

    Player.prototype.unmute = function() {
        var self = this;

        this.ready.then(function() {
            self.media.unMute();
        });
    };

    Player.prototype.setVolume = function(val) {
        var self = this;

        this.ready.then(function() {
            self.media.setVolume(val);
        });
    };

    Player.prototype.fadeMute = function() {
        this.mute();
    };

    Player.prototype.fadeUnmute = function() {
        this.unmute();
    };

    Player.prototype.onEnded = function(callback) {
        this.endListeners.push(callback);
    };

    Player.prototype.onPause = function(callback) {
        this.pauseListeners.push(callback);
    };

    Player.prototype.onTimeupdate = function(callback) {
        this.updateListeners.push(callback);
    };

    Player.prototype.loadVideoById = function(vid) {
        var self = this;

        this.ready.then(function() {
            self.media.loadVideoById(vid);
        });
    };

    return Player;
})();