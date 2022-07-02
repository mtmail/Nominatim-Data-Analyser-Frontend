import { Style, Circle, Stroke, Fill, Text, Icon } from "ol/style";
import {Feature} from 'ol';
import {Point} from 'ol/geom';
import BaseLayer from 'ol/layer/Base';

/**
 * Filter containing all the keys which should be ignored when
 * the properties of a feature are rendered.
 */
const FILTERED_PROPERTY_KEYS = [
    'geometry',
    'layer'
]

/**
 * Class handling the logic of a clustered features layer.
 */
abstract class ClusteredFeaturesLayer {
    private readonly mediumSize: any;
    private readonly bigSize: any;
    private readonly getFeatureSize: any;
    private readonly textFill: Fill;
    private readonly greenFill: Fill;
    private readonly orangeFill: Fill;
    private readonly redFill: Fill;
    private readonly singlePointStyle: Style;
    private readonly styleCache: {};

    protected constructor(mediumSize, bigSize, getFeatureSize) {
        this.mediumSize = mediumSize;
        this.bigSize = bigSize;
        this.getFeatureSize = getFeatureSize;
        this.textFill = new Fill({color: '#fff'});
        this.greenFill = new Fill({color:"rgba(0,128,0,1)"});
        this.orangeFill = new Fill({color:"rgba(255,128,0,1)"});
        this.redFill = new Fill({color:"rgba(192,0,0,1)"});
        this.singlePointStyle = new Style({
            image: new Circle({
                radius: 8,
                fill: new Fill({color:"rgba(66, 117, 245,0.8)"})
            })
        });
        this.styleCache = {};
    }

    /**
     * Returns a Fill object different based on the size given in parameter. This function is needed
     * to not recreate a Fill object whenever we render a feature.
     * @param {number} size Size of the feature.
     * @returns {Fill} OpenLayers Fill object corresponding to the size. 
     */
    getFillBySize(size: number) {
        return size > this.bigSize ? this.redFill : size > this.mediumSize ? this.orangeFill : this.greenFill;
    }

    /**
     * Generate the OpenLayers Style for the given feature. The style is dynamically
     * generated based on the clustered feature size and other parameters.
     * @returns {Style} OpenLayers style of the feature.
     */
    getStyle(feature: Feature<Point>){
        const size = this.getFeatureSize(feature);
        let style = this.styleCache[size];

        if (!style) {
            if (size === 1) {
                style = this.styleCache[size] = this.singlePointStyle;
            }else {
                const color = size>this.bigSize ? '192,0,0' : size>this.mediumSize ? '255,128,0' : '0,128,0';
                const radius = Math.max(8, Math.min(size * 0.15, 20));
                const dashPos = 2*Math.PI*radius/6;
                const dashes = [ 0, dashPos, dashPos, dashPos, dashPos, dashPos, dashPos ];

                style = this.styleCache[size] = new Style({
                    image: new Circle({
                        radius: radius,
                        stroke: new Stroke({
                        color: "rgba("+color+",0.5)", 
                        width: 15 ,
                        lineDash: dashes,
                        lineCap: "butt"
                        }),
                        fill: this.getFillBySize(size)
                    }),
                    text: new Text({
                        text: size.toString(),
                        fill: this.textFill
                    })
                });
            }
        }
        return style;
    }

    /**
     * Called when a feature of this layer has been clicked.
     * This method should be overriden by the child classes.
     */
    abstract onFeatureClick(feature, coordinates, map, overlay, popup): void;

    /**
     * Returns the properties of the given feature object.
     * This method should be overriden by the child classes.
     */
    abstract getFeatureProperties(feature): {};

    abstract get olLayer(): BaseLayer;
    
    /**
     * Generate the content of the popup. The content is the HTML representation of the
     * features properties.
     * 
     * If the key of the property follows a specific pattern, its value get replaced by a link to
     * the OpenStreetMap matching feature (based on its osm_id).
     * @returns {String} HTML content in String format.
     */
    constructPopupContent(feature: Feature<Point>, coordinates: number[]) {
        const properties = this.getFeatureProperties(feature);
        const re_numeric = /^[0-9]+$/;
        let out = '';

        for (let p in properties) {
            if (properties.hasOwnProperty(p)) {
                let value = properties[p].toString();
                if (FILTERED_PROPERTY_KEYS.includes(p)) {
                    continue;
                } else if ((p === 'node_id' || p === 'way_id' || p === 'relation_id' || p.match('^[nwr]\/@id')) && value.match(re_numeric)) {
                    //Get the data type ('n' or 'w' or 'r')
                    const data_type = p.charAt(0)
                    if (p.match('^[nwr]\/@id')) {
                        p = p.slice(5)
                    } else {
                        //For example transform 'node_id' into 'Node ID'
                        const splitted = p.split('_')
                        p = splitted[0].charAt(0).toUpperCase() + splitted[0].slice(1) + ' ' + splitted[1].toUpperCase()
                    }
                    const osm_id = value
                    const types_mapping = {
                        n: 'node',
                        w: 'way',
                        r: 'relation'
                    }
                    const osm_url = 'https://www.openstreetmap.org/' + types_mapping[data_type] + '/' + osm_id;
                    const id_url = `https://www.openstreetmap.org/edit?editor=id&lon=${coordinates[0]}&lat=${coordinates[1]}&zoom=18&${types_mapping[data_type]}=${osm_id}`
                    const id_title = 'Edit in ID editor';
                    // JSOM URL: https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl
                    // JOSM URL link target is a hidden iframe, otherwise browsers open a new tab
                    const bbox = [
                        (coordinates[0] - 0.001), // left
                        (coordinates[1] + 0.001), // top
                        (coordinates[0] + 0.001), // right
                        (coordinates[1] - 0.001)  // bottom
                    ];
                    const josm_url = `http://localhost:8111/load_and_zoom?left=${bbox[0]}&right=${bbox[2]}&top=${bbox[1]}&bottom=${bbox[3]}&select=${types_mapping[data_type]}${osm_id}&zoom_mode=download`;
                    const josm_title = 'Edit in JOSM (JOSM must be running and JOSM remote control plugin must be enabled for this to work)';
                    value = `<a target="_blank" href="${osm_url}">${osm_id}</a>`
                            + ` <a href="${id_url}" target="_blank" title="${id_title}"><img src="assets/icons/to_id.png" /></a>`
                            + ` <a href="${josm_url}" target="hiddenIframe" title="${josm_title}"><img src="assets/icons/to_josm.png" /></a>`;
                } else if (p === 'timestamp') {
                    p = 'Timestamp';
                    value = value.replace(/^([0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])T([0-9][0-9]:[0-9][0-9]:[0-9][0-9])Z$/, "$1 $2");
                }
                out += `<p><span class='bold'>${p}</span>: ${value}</p>`;
            }
        }
        return out;
    }
}

export default ClusteredFeaturesLayer;
