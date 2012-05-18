var CartoDB = CartoDB || {};

(function($) {

if (typeof(google.maps.CartoDBLayer) !== "undefined") {
    return;
}

google.maps.CartoDBLayer = function(params)
{
    var defaultOptions = {
        map_style: null,
        infowindow: false,
        tile_style: null,
        auto_bound: false,
        debug: false
    },
    ctx = this;
    
    this.infowindow = null,
    this.tilejson = null,
    this.iteraction = null,
    this.cache_buster = 0,
    this.interaction=null,
    this.layer = null;
    this.visible = true;
    this.active = true;
    this.waxOptions = {
        callbacks: {
            out: function(){
              ctx.params.map.setOptions({draggableCursor: 'default'});
            },
            over: function(feature, div, opt3, evt){
              ctx.params.map.setOptions({draggableCursor: 'pointer'});
            },
            click: function(feature, div, opt3, evt){
              // If there are more than one cartodb layer, close all possible infowindows
              ctx.infowindow.hideAll();
              ctx.infowindow.open(feature,evt.latLng);
            }
        },
        clickAction: 'full'
    };
    this.params = $.extend({}, defaultOptions, params);
    
    (function initialize()
    {
        if (this.params.map_style)  // Map style? ok, let's style.
            setCartoDBMapStyle();
            
        if (this.params.auto_bound) // Bounds? CartoDB does it.
            autoBound();
        if (this.params.infowindow){
            addWaxCartoDBTiles.apply(this);
        }
        else{
            addSimpleCartoDBTiles.apply(this);
        }
    }).apply(this);
    
    function setCartoDBMapStyle() {
        $.ajax({
          url: 'http://' + ctx.params.user_name + '.cartodb.com/tiles/' + ctx.params.table_name + '/map_metadata?callback=?',
          dataType: 'jsonp',
          timeout: 2000,
          callbackParameter: 'callback',
          success: function(result) {
            var map_style = $.parseJSON(result.map_metadata);

            if (!map_style || map_style.google_maps_base_type=="roadmap") {
              ctx.params.map.setOptions({mapTypeId: google.maps.MapTypeId.ROADMAP});
            } else if (map_style.google_maps_base_type=="satellite") {
              ctx.params.map.setOptions({mapTypeId: google.maps.MapTypeId.SATELLITE});
            } else if (map_style.google_maps_base_type=="terrain") {
              ctx.params.map.setOptions({mapTypeId: google.maps.MapTypeId.TERRAIN});
            } else {
              var mapStyles = [ { stylers: [ { saturation: -65 }, { gamma: 1.52 } ] },{ featureType: "administrative", stylers: [ { saturation: -95 }, { gamma: 2.26 } ] },{ featureType: "water", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "administrative.locality", stylers: [ { visibility: "off" } ] },{ featureType: "road", stylers: [ { visibility: "simplified" }, { saturation: -99 }, { gamma: 2.22 } ] },{ featureType: "poi", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "road.arterial", stylers: [ { visibility: "off" } ] },{ featureType: "road.local", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "transit", stylers: [ { visibility: "off" } ] },{ featureType: "road", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "poi", stylers: [ { saturation: -55 } ] } ];
              map_style.google_maps_customization_style = mapStyles;
              ctx.params.map.setOptions({mapTypeId: google.maps.MapTypeId.ROADMAP});
            }

            // Custom tiles
            if (!map_style) {
              map_style = {google_maps_customization_style: []};
            }
            ctx.params.map.setOptions({styles: map_style.google_maps_customization_style});
          },
          error: function(e, msg) {
            if (ctx.params.debug) throw('Error getting map style: ' + msg);
          }
        });
    }
    
    function autoBound() {
        // Zoom to your geometries
        $.ajax({
            url:'http://'+ctx.params.user_name+'.cartodb.com/api/v1/sql/?q='+escape('select ST_Extent(the_geom) from '+ ctx.params.table_name),
            dataType: 'jsonp',
            timeout: 2000,
            callbackParameter: 'callback',
                success: function(result) {
                if (result.rows[0].st_extent!=null) {
                    var coordinates = result.rows[0].st_extent.replace('BOX(','').replace(')','').split(','),
                        coor1 = coordinates[0].split(' '),
                        coor2 = coordinates[1].split(' '),
                        lon0 = coor1[0],
                        lat0 = coor1[1],
                        lon1 = coor2[0],
                        lat1 = coor2[1];

                    // Check bounds
                    var minlat = -85.0511
                    , maxlat =  85.0511
                    , minlon = -179
                    , maxlon =  179;

                    /* Clamp X to be between min and max (inclusive) */
                    var clampNum = function(x, min, max) {
                        return x < min ? min : x > max ? max : x;
                    }

                    lon0 = clampNum(lon0, minlon, maxlon);
                    lon1 = clampNum(lon1, minlon, maxlon);
                    lat0 = clampNum(lat0, minlat, maxlat);
                    lat1 = clampNum(lat1, minlat, maxlat);

                    var sw = new google.maps.LatLng(lat0, lon0),
                        ne = new google.maps.LatLng(lat1, lon1),
                        bounds = new google.maps.LatLngBounds(sw,ne);

                    ctx.params.map.fitBounds(bounds);
                }
            },
            error: function(e,msg) {
                if (ctx.params.debug)
                    throw('Error getting table bounds: ' + msg);
            }
        });
    }
    
    function addSimpleCartoDBTiles(){
        // Add the cartodb tiles
        var ctx = this;
        var cartodb_layer = {
          getTileUrl: function(coord, zoom) {
            return 'http://' + ctx.params.user_name + '.cartodb.com/tiles/' + ctx.params.table_name + '/'+zoom+'/'+coord.x+'/'+coord.y+'.png?sql='+ctx.params.query.replace(/\{\{table_name\}\}/g,ctx.params.table_name) + '&style=' + ((ctx.params.tile_style)?encodeURIComponent(ctx.params.tile_style.replace(/\{\{table_name\}\}/g,ctx.params.table_name)):'');
          },
          tileSize: new google.maps.Size(256, 256),
          name: ctx.params.query,
          description: false
        };
        ctx.layer = new google.maps.ImageMapType(cartodb_layer);
        ctx.params.map.overlayMapTypes.insertAt(0,ctx.layer);
    }
    
    function addWaxCartoDBTiles(){
        this.tilejson = generateTileJson.apply(this);
        this.infowindow = new CartoDB.Infowindow(this.params);
        this.cache_buster = 0;

        this.layer = new wax.g.connector(this.tilejson);
        this.params.map.overlayMapTypes.insertAt(0,this.layer);
        this.interaction = wax.g.interaction(this.params.map, this.tilejson, this.waxOptions);
    }
    
    function generateTileJson() {
        var core_url = 'http://' + this.params.user_name + '.cartodb.com';  
        var base_url = core_url + '/tiles/' + this.params.table_name + '/{z}/{x}/{y}';
        var tile_url = base_url + '.png?cache_buster=0';
        var grid_url = base_url + '.grid.json';

        // SQL?
        if (this.params.query) {
          var query = 'sql=' + encodeURIComponent(this.params.query.replace(/\{\{table_name\}\}/g,this.params.table_name));
          tile_url = wax.util.addUrlData(tile_url, query);
          grid_url = wax.util.addUrlData(grid_url, query);
        }

        // Tiles style ?
        if (this.params.tile_style) {
          var style = 'style=' + encodeURIComponent(this.params.tile_style.replace(/\{\{table_name\}\}/g,this.params.table_name));
          tile_url = wax.util.addUrlData(tile_url,style);
          grid_url = wax.util.addUrlData(grid_url,style);
        }

        // Build up the tileJSON
        // TODO: make a blankImage a real 'empty tile' image
        return {
          blankImage: 'blank_tile.png', 
          tilejson: '1.0.0',
          scheme: 'xyz',
          tiles: [tile_url],
          grids: [grid_url],
          tiles_base: tile_url,
          grids_base: grid_url,
          name: this.params.query,
          description: true,
          formatter: function(options, data) {
            currentCartoDbId = data.cartodb_id;
            return data.cartodb_id;
          },
          cache_buster: function(){
            return cache_buster;
          }
        };
    }
    
    // Refresh wax interaction
    function refreshWax(layerPosition) {
        if(!layerPosition) layerPosition = 0;
        if (this.params.infowindow) {
            this.cache_buster++;
            this.tilejson = generateTileJson.apply(this);
  
            // Setup new wax
            this.tilejson.grids = wax.util.addUrlData(this.tilejson.grids_base,  'cache_buster=' + this.cache_buster);

            // Add map tiles
            this.layer = new wax.g.connector(this.tilejson);
            this.params.map.overlayMapTypes.insertAt(layerPosition,this.layer);

            // Add interaction
            this.interaction.remove();
            this.interaction = wax.g.interaction(this.params.map, this.tilejson, this.waxOptions);
        }
    }
    
    // Remove old cartodb layer added (wax or imagemaptype)
      function removeOldLayer() {
        if (this.layer) {
            var layer = this.layer;
          var pos = -1;
            this.params.map.overlayMapTypes.forEach(function(map_type,i){
            if (map_type == layer && map_type.name == layer.name && map_type.description == layer.description) {
              pos = i;
            }
          });
          if (pos!=-1) 
            this.params.map.overlayMapTypes.removeAt(pos);
            this.layer = null;
        }
        return pos;
    }
  
    // Update tiles & interactivity layer;
    google.maps.CartoDBLayer.prototype.update = function(changes) {
        // Destroy the infowindow if existed
        if (this.infowindow) {
            this.infowindow.destroy();
            this.infowindow.draw();
        }

	    // What do we support change? - tile_style | query | infowindow
	    if (typeof changes == 'object') {
		    for (var param in changes) {
              	if (param != "tile_style" && param != "query" && param != "infowindow") {
                    if (this.params.debug) {
                  		throw("Sorry, you can't update " + param);
                  	}else {
                  		return;
                  	}
                }else {
              	    this.params[param] = changes[param];
                }
		    }
	    } else {
		    if (this.params.debug) {
  		        throw("This method only accepts a javascript object");
          	} else {
          		return;
          	}
	    }
        // Removes previous tiles
        var layerPosition = removeOldLayer.apply(this);

        // Add new one updated
        if (this.params.infowindow)
            refreshWax.apply(this,[layerPosition]);
        else
		    addSimpleCartoDBTiles.apply(this, [this.params]);

        this.params.active = true;
        this.params.visible = true;
    };
    
    // Destroy layers from the map
    google.maps.CartoDBLayer.prototype.destroy = function() {
        // First remove previous cartodb - tiles.
        removeOldLayer.apply(this);

        if (this.infowindow) {
            // Remove wax interaction
            this.interaction.remove();
            this.infowindow.hide();
        }

        this.active = false;
    };
  
    // Hide layers from the map
    google.maps.CartoDBLayer.prototype.hide = function() {
        this.destroy();
        this.visible = false;
    };

    // Show layers from the map
    google.maps.CartoDBLayer.prototype.show = function() {
        if (!this.visible || !this.active) {
          this.update({query: this.params.query});
          this.visible = true;
        }
    };

    // CartoDB layer visible?
    google.maps.CartoDBLayer.prototype.isVisible = function() {
        return this.visible;
    };
} // End google.maps.CartoDBLayer



CartoDB.Infowindow = function(params)
{
    var defaultOptions = {
        sql: null,
        template: '<a href="#close" class="close">x</a>'+
          '<div class="outer_top">'+
            '<div class="top">'+
            '</div>'+
          '</div>'+
          '<div class="bottom">'+
          '</div>',
      pixelOffset: new google.maps.Size(0, 0),
      width: 214
    };
    if(typeof params.infowindow === "string"){
        this.useDefaultTemplate = true;
        defaultOptions.sql = params.infowindow;
        defaultOptions.pixelOffset = function(w,h){
            return new google.maps.Size(-50, -h+7);
        }
    }else{
        this.useDefaultTemplate = false;
    }
    this.latLng = new google.maps.LatLng(0,0);
    this.params = params;
    this.options = $.extend({}, defaultOptions, params.infowindow);
    this.setMap(params.map);
    this.$div = false;
}

CartoDB.Infowindow.prototype = new google.maps.OverlayView();

CartoDB.Infowindow.prototype.draw = function(){
    var ctx = this;
    var $div = $('<div class="cartodb_infowindow">'+this.options.template+'</div>');
    $div.css({
        visibility: 'hidden',
        width: this.options.width
    });
    var div = $div[0];
    var panes = this.getPanes();
    panes.floatPane.appendChild(div);
    this.$div = $($div[0]);
    if(this.options.className){
        this.$div.addClass(this.options.className);
    }
    this.$div.find('a.close').live('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        ctx.hide();
    });
  
    google.maps.event.addDomListener(div, 'click', function (ev) {
        ev.preventDefault ? ev.preventDefault() : ev.returnValue = false;
    });
    google.maps.event.addDomListener(div, 'dblclick', function (ev) {
        ev.preventDefault ? ev.preventDefault() : ev.returnValue = false;
    });
    google.maps.event.addDomListener(div, 'mousedown', function (ev) {
        ev.preventDefault ? ev.preventDefault() : ev.returnValue = false;
        ev.stopPropagation ? ev.stopPropagation() : window.event.cancelBubble = true;
    });
    google.maps.event.addDomListener(div, 'mouseup', function (ev) {
        ev.preventDefault ? ev.preventDefault() : ev.returnValue = false;
    });
    google.maps.event.addDomListener(div, 'mousewheel', function (ev) {
        ev.stopPropagation ? ev.stopPropagation() : window.event.cancelBubble = true;
    });
    google.maps.event.addDomListener(div, 'DOMMouseScroll', function (ev) {
        ev.stopPropagation ? ev.stopPropagation() : window.event.cancelBubble = true;
    });
    
}

CartoDB.Infowindow.prototype.open = function(feature, latLng){
    var ctx = this,
        infowindow_sql = 'SELECT * FROM ' + this.params.table_name + ' WHERE cartodb_id=' + feature;

    // If the table is private, you can't run any api methods
    if (this.options.sql != false) {
        infowindow_sql = this.options.sql.replace('{{feature}}',feature);
    }

    // Replace {{table_name}} for table name
    infowindow_sql = encodeURIComponent(infowindow_sql.replace(/\{\{table_name\}\}/g,this.params.table_name));

    $.ajax({
        url:'http://'+ this.params.user_name +'.cartodb.com/api/v1/sql/?q='+infowindow_sql,
        dataType: 'jsonp',
        timeout: 2000,
        callbackParameter: 'callback',
        success: function(result) {
            positionateInfowindow.apply(ctx, [result.rows[0], latLng]);
        },
        error: function(e,msg) {
            if (ctx.params_.debug)
                throw('Error retrieving infowindow variables: ' + msg);
        }
    });

    function positionateInfowindow(variables,center) {
        
        // Get latlng position
        this.latLng = center;
        if(!this.useDefaultTemplate){
            var tpl = this.options.template.replace(/\{\{(\w+)\}\}/g, function(a, capture){
                if(variables[capture]){
                    return variables[capture];
                }else{
                    return '';
                }
            });
            this.$div.html(tpl);
        }else{
            // Remove the unnecessary html
            $('div.cartodb_infowindow div.outer_top div.top').html('');
            $('div.cartodb_infowindow div.outer_top div.bottom label').html('');

            // List all the new variables
            for (p in variables) {
              if (p!='cartodb_id' && p!='cdb_centre' && p!='the_geom_webmercator') {
                $('div.cartodb_infowindow div.outer_top div.top').append('<label>'+p+'</label><p class="'+((variables[p]!=null && variables[p]!='')?'':'empty')+'">'+(variables[p] || 'empty')+'</p>');
              }
            }

            // Show cartodb_id?
            if (variables['cartodb_id']) {
              $('div.cartodb_infowindow div.bottom').html($('<label/>').html('id: <strong>'+feature+'</strong>'));
            }
        }

        this.setPosition();
        this.moveMaptoOpen();
    }
}

CartoDB.Infowindow.prototype.setPosition = function(){
    if (this.$div) {
        var pixPosition = this.getProjection().fromLatLngToDivPixel(this.latLng);
        if (pixPosition) {
            var pixelOffset = typeof this.options.pixelOffset == 'function'? 
                this.options.pixelOffset(this.$div.width(), this.$div.height()) 
                : this.options.pixelOffset;    
            var left = pixPosition.x + pixelOffset.width;
            var top = pixPosition.y + pixelOffset.height;
            this.$div.css({
                'left':  left + 'px',
                'top':  top + 'px'
            });
        }
        this.show();
    }
}

CartoDB.Infowindow.prototype.hide = function() {
    var ctx = this;
    if (this.$div) {
        this.$div.animate({
                top: '+=' + 10 + 'px',
                opacity: 0
            },
            100, 'swing',
            function () {
              ctx.$div.css({ visibility: "hidden"});
            }
      );
    }
};

CartoDB.Infowindow.prototype.show = function() {
    if (this.$div) {
        this.$div.css({
            opacity: 0,
            visibility: 'visible'
        });
        this.$div.animate({
                top: '-=' + 10 + 'px',
                opacity: 1
            },
            250
        );
    }
};

CartoDB.Infowindow.prototype.destroy = function() {
    // Check if the overlay was on the map and needs to be removed.
    if (this.$div) {
      this.$div.remove();
      this.$div = null;
    }
};

CartoDB.Infowindow.prototype.hideAll = function() {
    $('div.cartodb_infowindow').css('visibility','hidden');
};

CartoDB.Infowindow.prototype.isVisible = function(marker_id) {
    if (this.$div) {
        if ($div.css('visibility') == 'visible' && this.options.sql != null) {
            return true;
        } else {
            return false;
        }
    }
    return false;
};

CartoDB.Infowindow.prototype.moveMaptoOpen = function() {
    var left = 0;
    var top = 0;
    var mapWidth = $('#'+this.params.map_canvas).width();
    var mapHeight = $('#'+this.params.map_canvas).height();
    var divPosition = this.$div.position();
    var divWidth = this.$div.outerWidth();
    var divHeight = this.$div.outerHeight();
    var pixelOffset = typeof this.options.pixelOffset == 'function'? 
        this.options.pixelOffset(this.$div.width(), this.$div.height()) 
        : this.options.pixelOffset;
    var pixPosition = this.getProjection().fromLatLngToContainerPixel(this.latLng);
    
    var divTop = (pixPosition.y  + pixelOffset.height);
    var divBottom = (pixPosition.y  + pixelOffset.height) + divHeight;
    var divRight = (pixPosition.x + pixelOffset.width + divWidth);
    var divLeft = pixPosition.x + pixelOffset.width;
    
    if(divTop < 0){
        top += divTop-15;
    }
    
    if(divBottom>mapHeight){
        top += divBottom-mapHeight;
    }
    
    if(divLeft < 0){
        left += divLeft-15
    }
    
    if(divRight>mapWidth){
        left += divRight-mapWidth;
    }

    this.params.map.panBy(left,top);
};



})(jQuery);
