Symple.Media = {
    engines: {}, // Object containing references for candidate selection
    
    registerEngine: function(engine) {
        console.log('Register media engine: ', engine)
        if (!engine.name || typeof engine.preference == 'undefined' || typeof engine.support == 'undefined') {
            console.log('Cannot register invalid engine: ', engine)
            return false;
        }   
        this.engines[engine.id] = engine;
        return true;
    },
    
    hasEngine: function(id) {
        return typeof this.engines[id] == 'object';
    },
    
    // Checks support for a given engine
    supportsEngine: function(id) {
        // Check support for engine
        return !!(this.hasEngine(id) && this.engines[id].support);
    },
    
    // Checks support for a given format
    supportsFormat: function(format) {
        // Check support for engine
        return !!preferredEngine(format);
    },
    
    // Returns a list of compatible engines sorted by preference
    // The optional format argument further filters by engines 
    // which don't support the given media format.
    compatibleEngines: function(format) {          
        var arr = [], engine;
        // Reject non supported or disabled
        for (var item in this.engines) {   
            engine = this.engines[item];
            if (engine.preference == 0) 
                continue;
            console.log('Symple Media: Supported: ', engine.name, engine.support)            
            if (engine.support == true)        
                arr.push(engine)
        }
        // Sort by preference
        arr.sort(function (a, b) {
            if (a.preference < b.preference) return 1;
            if (a.preference > b.preference) return -1;
        });
        return arr
    },
    
    // Returns the highest preference compatible engine
    // The optional format argument further filters by engines 
    // which don't support the given media format.
    preferredCompatibleEngine: function(format) {    
        var arr = this.compatibleEngines(format), engine;  
        engine = arr.length ? arr[0] : null;
        console.log('Symple Media: Preferred Engine: ', engine);
        return engine; 
    },

    // Returns the optimal video resolution for the current device
    // TODO: Different aspect ratios
    getOptimalVideoResolution: function() {
        var w = $(window).width();
        var width = w > 800 ?
          800 : w > 640 ?
          640 : w > 480 ?
          400 : w > 320 ?
          320 : w > 240 ?
          240 : w > 160 ?
          160 : w > 128 ?
          128 : 96;
        var height = width * 0.75;
        return [width, height];
    },
    
    buildURL: function(params) { 
        var query = [], url, addr = params.address;       
        url = addr.scheme + '://' + addr.host + ':' + addr.port + (addr.uri ? addr.uri : '/');                     
        for (var p in params) {
            if (p == 'address') 
                continue;
            query.push(encodeURIComponent(p) + "=" + encodeURIComponent(params[p]));
        }
        query.push('rand=' + Math.random());
        url += '?';
        url += query.join("&");  
        return url;
        
    },
    
    // Rescales video dimensions maintaining perspective
    // TODO: Different aspect ratios
    rescaleVideo: function(srcW, srcH, maxW, maxH) {
        //console.log('Symple Player: Rescale Video: ', srcW, srcH, maxW, maxH);
        var maxRatio = maxW / maxH;
        var srcRatio = 1.33; //srcW / srcH;
        if (srcRatio < maxRatio) {
            srcH = maxH;
            srcW = srcH * srcRatio;
        } else {
            srcW = maxW;
            srcH = srcW / srcRatio;
        }
        return [srcW, srcH];
    },
        
    // Basic checking for ICE style streaming candidates
    // TODO: Latency checks and best candidate switching
    checkCandidate: function(url, fn) {
        console.log('Symple Media: Checking candidate: ', url);

        var xhr;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
        } else if (window.ActiveXObject) {
            xhr = new ActiveXObject("Microsoft.XMLHTTP");
        } else {
            fn(url, false);
            return;
        }

        xhr.onreadystatechange = function() {
            //console.log('Symple Media: Candidate state', xhr.readyState, xhr.status);

            if (xhr.readyState == 2) {
                if (fn) {
                    console.log('Symple Media: Candidate result: ', xhr.readyState, xhr.status);
                    fn(url, xhr.status == 200);
                    fn = null;

                    // Safari on windows crashes when abort is called from inside
                    // the onreadystatechange callback.
                    setTimeout(function() {
                        xhr.abort();
                    }, 0);
                }
            }
            else if (xhr.readyState == 4/* && xhr.status != 0*/) {
                if (fn) {
                    console.log('Symple Media: Candidate result: ', xhr.readyState, xhr.status);
                    fn(url, /*xhr.status == 200*/true);
                    fn = null;
                }
            }
        };
        xhr.open('GET', url, true);
        xhr.send(null);
    },
};

// ----------------------------------------------------------------------------
//  Symple Player
//
//  Online video streaming for everyone
//  Requires JQuery
//
Symple.Player = Symple.Class.extend({
    init: function(options) {
        // TODO: Use our own options extend
        this.options = $.extend({ //Symple.extend({
            htmlRoot:       '/static/symple/client',
            element:        '.symple-player:first',
            
            format:         'MJPEG',      // The media format to use (MJPEG, FLV, Speex, ...)
            engine:         undefined,    // Engine class name, can be specified or auto detected 
            
            //screenWidth:    '100%',       // player screen css width (percentage or pixel value)
            //screenHeight:   '100%',       // player screen css height (percentage or pixel value)
            //showStatus:     false,
            //assertSupport:  false,        // throws an exception if no browser support for given engine

            // Callbacks
            onCommand:       function(player, cmd) { },
            onStateChange:   function(player, state) { },
            
            // Markup
            template: '\
            <div class="symple-player">\
                <div class="symple-player-message"></div>\
                <div class="symple-player-status"></div>\
                <div class="symple-player-loading"></div>\
                <div class="symple-player-screen"></div>\
                <div class="symple-player-controls">\
                    <a class="play-btn" rel="play" href="#">Play</a>\
                    <a class="stop-btn" rel="stop" href="#">Stop</a>\
                    <a class="fullscreen-btn" rel="fullscreen" href="#">Fullscreen</a>\
                </div>\
            </div>'

        }, options);

        this.element = $(this.options.element);
        if (!this.element.hasClass('symple-player')) {
            this.element.html(this.options.template);
            this.element = this.element.children('.symple-player:first');
        }
        if (!this.element.length)
            throw 'Player element not found';
        
        this.screen = this.element.find('.symple-player-screen');
        if (!this.screen.length)
            throw 'Player screen element not found';
        
        // Depreciated: Screen is always 100% unless speified otherwise via CSS
        //if (this.options.screenWidth)
        //    this.screen.width(this.options.screenWidth);
        //if (this.options.screenHeight)
        //    this.screen.height(this.options.screenHeight);
            
        this.message = this.element.find('.symple-player-message')
        if (!this.message.length)
            throw 'Player message element not found';

        // Try to choose the best engine if none was given
        if (typeof this.options.engine  == 'undefined') {
            var engine = Symple.Media.preferredCompatibleEngine(this.options.format);
            if (engine)
                this.options.engine = engine.id;
        }

        this.bindEvents();
        this.playing = false;

        console.log(this.options.template)

        //this.setState('stopped');
        //var self = this;
        //$(window).resize(function() {
        //    self.refresh();
        //});
    },

    setup: function() {
        var id = this.options.engine;
        
        // Ensure the engine is configured
        if (!id)
            throw "Streaming engine not configured. Please set 'options.engine'";  
        
        // Ensure the engine exists
        if (!Symple.Media.hasEngine(id))
            throw "Streaming engine not available: " + id;                          
        if (typeof Symple.Player.Engine[id] == 'undefined')
            throw "Streaming engine not found: " + id;       
            
        // Ensure the engine is supported  
        if (!Symple.Media.supportsEngine(id))     
            throw "Streaming engine not supported: " + id;   
                 
        // Instantiate the engine          
        this.engine = new Symple.Player.Engine[id](this);
        this.engine.setup();  
        
        this.element.addClass('engine-' + id.toLowerCase())    
    },
    
    //
    // Player Controls
    //
    play: function(params) {
        console.log('Symple Player: Play: ', params)
        try {    
            if (!this.engine)
                this.setup();
        
            if (this.state != 'playing' //&&
                // The player may be set to loading state by the
                // outside application before play is called.
                //this.state != 'loading'
                ) {
                this.setState('loading');
                this.engine.play(params); // engine updates state to playing
            }
        } catch (e) {
            this.setState('error');      
            this.displayMessage('error', e)
            throw e;
        } 
    },

    stop: function() {
        console.log('Symple Player: Stop')
        if (this.state != 'stopped') {
            if (this.engine)
                this.engine.stop(); // engine updates state to stopped
        }
    },

    destroy: function() {
        if (this.engine)
            this.engine.destroy();
        this.element.remove();
    },

    setState: function(state, message) {
        console.log('Symple Player: Set state:', this.state, '=>', state, message)
        if (this.state == state)
            return;
        
        this.state = state;
        this.displayStatus(null);
        this.playing = state == 'playing';
        if (message)
            this.displayMessage(state == 'error' ? 'error' : 'info', message);
        else
            this.displayMessage(null);
        this.element.removeClass('state-stopped state-loading state-playing state-paused state-error');
        this.element.addClass('state-' + state);
        //this.refresh();
        this.options.onStateChange(this, state, message);
    },

    //
    // Helpers
    //
    displayStatus: function(data) {
        this.element.find('.symple-player-status').html(data ? data : '');
    },

    // Display an overlayed player message
    // error, warning, info
    displayMessage: function(type, message) {
        console.log('Symple Player: Display message:', type, message)
        if (message) {
            this.message.html('<p class="' + type + '-message">' + message + '</p>').show();
        }
        else {
            this.message.html('').hide();
        }
    },

    bindEvents: function() {
        var self = this;
        this.element.find('.symple-player-controls a').unbind().bind('click tap', function() {
            self.sendCommand(this.rel, $(this));
            return false;
        })
    },

    sendCommand: function(cmd, e) {
        if (!this.options.onCommand ||
            !this.options.onCommand(this, cmd, e)) {

            // If there is no command callback function or the callback returns
            // false then we process these default behaviours.
            switch(cmd) {
              case 'play':
                  this.play();
                  break;
              case 'stop':
                  this.stop();
                  break;
              case 'fullscreen':
                  this.toggleFullScreen();
                  break;
            }
        }
    },

    getButton: function(cmd) {
        return this.element.find('.symple-player-controls [rel="' + cmd + '"]');
    },
    
    // TODO: Toggle actual player element
    toggleFullScreen: function() {  
        if (Symple.runVendorMethod(document, "FullScreen") || Symple.runVendorMethod(document, "IsFullScreen")) {
            Symple.runVendorMethod(document, "CancelFullScreen");
        }
        else {
            Symple.runVendorMethod(this.element[0], "RequestFullScreen");
        }
    }
})


// -----------------------------------------------------------------------------
// Player Engine Interface
//
Symple.Player.Engine = Symple.Class.extend({
    init: function(player) {
        this.player = player;        
        this.fps = 0;
        this.seq = 0;
    },

    support: function() { return true; },
    setup: function() {},
    destroy: function() {},
    play: function(params) { 
        this.params = params || {};
        if (!this.params.url && typeof(params.address) == 'object')
            this.params.url = this.buildURL();
    },
    stop: function() {},
    pause: function(flag) {},
    mute: function(flag) {},
    //refresh: function() {},

    setState: function(state, message) {
        this.player.setState(state, message);
    },
    
    setError: function(error) {
        console.log('Symple Player Engine: Error:', error);
        this.setState('error', error);
    },
    
    onRemoteCandidate: function(candidate) {
        console.log('Symple Player Engine: Remote candidates not supported.');
    },

    updateFPS: function() {
        if (typeof this.prevTime == 'undefined')
            this.prevTime = new Date().getTime();
        if (this.seq > 0) {
            var now = new Date().getTime();
            this.delta = this.prevTime ? now - this.prevTime : 0;
            this.fps = (1000.0 / this.delta).toFixed(3);
            this.prevTime  = now;
        }
        this.seq++;
    },
    
    displayFPS: function() {
        this.updateFPS()
        this.player.displayStatus(this.delta + " ms (" + this.fps + " fps)");
    },
    
    buildURL: function() {    
        if (!this.params)
            throw 'Streaming parameters not set'
        if (!this.params.address)
            this.params.address = this.player.options.address;
        return Symple.Media.buildURL(this.params);
    }
});




    /*
    refresh: function() {
        if (this.engine)
            this.engine.refresh();
    },

    refresh: function() {
        var css = { position: 'relative' };
        if (this.options.screenWidth == '100%' ||
            this.options.screenHeight == '100%') {
            var size = this.rescaleVideo(this.screen.outerWidth(), this.screen.outerHeight(),
                this.element.outerWidth(), this.element.outerHeight());
            css.width = size[0];
            css.height = size[1];
            css.left = this.element.outerWidth() / 2 - css.width / 2;
            css.top = this.element.outerHeight() / 2 - css.height / 2;
            css.left = css.left ? css.left : 0;
            css.top = css.top ? css.top : 0;
            if (this.engine)
                this.engine.resize(css.width, css.height);
        }
        else {
            css.width = this.options.screenWidth;
            css.height = this.options.screenHeight;
            css.left = this.element.outerWidth() / 2 - this.options.screenWidth / 2;
            css.top = this.element.outerHeight() / 2 - this.options.screenHeight / 2;
            css.left = css.left ? css.left : 0;
            css.top = css.top ? css.top : 0;
        }
        console.log('Symple Player: Setting Size: ', css);

        this.screen.css(css);

        //var e = this.element.find('#player-screen');
          //console.log('refresh: scaled:', size)
          console.log('refresh: screenWidth:', this.options.screenWidth)
          console.log('refresh: width:', this.screen.width())
          console.log('refresh: screenHeight:', this.options.screenHeight)
          console.log('refresh: height:', this.screen.height())
          console.log('refresh: css:', css)
    },
     
    getBestEngineForFormat: function(format) {
        var ua = navigator.userAgent;
        var isMobile = Symple.isMobileDevice();
        var engine = null;
        
        // TODO: Use this function with care as it is not complete.      
        // TODO: Register engines which we can iterate to check support.
        // Please feel free to update this function with your test results!  
        
        //
        // MJPEG
        //
        if (format == "MJPEG") {

            
            // Most versions of Safari has great MJPEG support.
            // BUG: The MJPEG socket is not closed until the page is refreshed.
            if (ua.match(/(Safari|iPhone|iPod|iPad)/)) {
                
                // iOS 6 breaks native MJPEG support.
                if (Symple.iOSVersion() > 6)
                    engine = 'MJPEGBase64MXHR';
                else
                    engine = 'MJPEG';
            }

            // Firefox to the rescue! Nag user's to install firefox if MJPEG
            // streaming is unavailable.
            else if(ua.match(/(Mozilla)/))
                engine = 'MJPEG';

            // Android's WebKit has disabled multipart HTTP requests for some
            // reason: http://code.google.com/p/android/issues/detail?id=301
            else if(ua.match(/(Android)/))
                engine = 'MJPEGBase64MXHR';

            // BlackBerry doesn't understand multipart/x-mixed-replace ... duh
            else if(ua.match(/(BlackBerry)/))
                engine = 'PseudoMJPEG';

            // Opera does not support mjpeg MJPEG, but their home grown image
            // processing library is super fast so pseudo streaming is nearly
            // as fast as other native MJPEG implementations!
            else if(ua.match(/(Opera)/))
                engine = isMobile ? 'MJPEGBase64MXHR' : 'Flash'; //PseudoMJPEG

            // Internet Explorer... nuff said
            else if(ua.match(/(MSIE)/))
                engine = isMobile ? 'PseudoMJPEG' : 'Flash';

            // Display a nag screen to install a real browser if we are in
            // pseudo streaming mode.
            if (engine == 'PseudoMJPEG') { //!forcePseudo &&
                this.displayMessage('warning',
                    'Your browser does not support native streaming so playback preformance will be severely limited. ' +
                    'For the best streaming experience please <a href="http://www.mozilla.org/en-US/firefox/">download Firefox</a> .');
             }
        }
         
         
        //
        // FLV
        //
        else if (format == "FLV") {
            if (Symple.isMobileDevice())
                throw 'FLV not supported on mobile devices.'
            engine = 'Flash';                
        }
        
        else 
            throw 'Unknown media format: ' + format
        
        return engine;
        if (!document.fullscreenElement &&    // alternative standard method
            !document.mozFullScreenElement && !document.webkitFullscreenElement) {  // current working methods
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        } 
        else {
            if (document.cancelFullScreen) {
                document.cancelFullScreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
        }
        */