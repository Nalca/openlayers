/**
 * @module ol/style/AtlasManager
 */
import {WEBGL_MAX_TEXTURE_SIZE, nullFunction} from '../index.js';
import Atlas from '../style/Atlas.js';


/**
 * @type {number} The size in pixels of the first atlas image.
 */
const INITIAL_ATLAS_SIZE = 256;

/**
 * @type {number} The maximum size in pixels of atlas images.
 */
const MAX_ATLAS_SIZE = -1;


/**
 * Manages the creation of image atlases.
 *
 * Images added to this manager will be inserted into an atlas, which
 * will be used for rendering.
 * The `size` given in the constructor is the size for the first
 * atlas. After that, when new atlases are created, they will have
 * twice the size as the latest atlas (until `maxSize` is reached).
 *
 * If an application uses many images or very large images, it is recommended
 * to set a higher `size` value to avoid the creation of too many atlases.
 *
 * @constructor
 * @struct
 * @api
 * @param {olx.style.AtlasManagerOptions=} opt_options Options.
 */
const AtlasManager = function(opt_options) {

  const options = opt_options || {};

  /**
   * The size in pixels of the latest atlas image.
   * @private
   * @type {number}
   */
  this.currentSize_ = options.initialSize !== undefined ?
    options.initialSize : INITIAL_ATLAS_SIZE;

  /**
   * The maximum size in pixels of atlas images.
   * @private
   * @type {number}
   */
  this.maxSize_ = options.maxSize !== undefined ?
    options.maxSize : MAX_ATLAS_SIZE != -1 ?
      MAX_ATLAS_SIZE : WEBGL_MAX_TEXTURE_SIZE !== undefined ?
        WEBGL_MAX_TEXTURE_SIZE : 2048;

  /**
   * The size in pixels between images.
   * @private
   * @type {number}
   */
  this.space_ = options.space !== undefined ? options.space : 1;

  /**
   * @private
   * @type {Array.<ol.style.Atlas>}
   */
  this.atlases_ = [new Atlas(this.currentSize_, this.space_)];

  /**
   * The size in pixels of the latest atlas image for hit-detection images.
   * @private
   * @type {number}
   */
  this.currentHitSize_ = this.currentSize_;

  /**
   * @private
   * @type {Array.<ol.style.Atlas>}
   */
  this.hitAtlases_ = [new Atlas(this.currentHitSize_, this.space_)];
};


/**
 * @param {string} id The identifier of the entry to check.
 * @return {?ol.AtlasManagerInfo} The position and atlas image for the
 *    entry, or `null` if the entry is not part of the atlas manager.
 */
AtlasManager.prototype.getInfo = function(id) {
  /** @type {?ol.AtlasInfo} */
  const info = this.getInfo_(this.atlases_, id);

  if (!info) {
    return null;
  }
  const hitInfo = /** @type {ol.AtlasInfo} */ (this.getInfo_(this.hitAtlases_, id));

  return this.mergeInfos_(info, hitInfo);
};


/**
 * @private
 * @param {Array.<ol.style.Atlas>} atlases The atlases to search.
 * @param {string} id The identifier of the entry to check.
 * @return {?ol.AtlasInfo} The position and atlas image for the entry,
 *    or `null` if the entry is not part of the atlases.
 */
AtlasManager.prototype.getInfo_ = function(atlases, id) {
  let atlas, info, i, ii;
  for (i = 0, ii = atlases.length; i < ii; ++i) {
    atlas = atlases[i];
    info = atlas.get(id);
    if (info) {
      return info;
    }
  }
  return null;
};


/**
 * @private
 * @param {ol.AtlasInfo} info The info for the real image.
 * @param {ol.AtlasInfo} hitInfo The info for the hit-detection
 *    image.
 * @return {?ol.AtlasManagerInfo} The position and atlas image for the
 *    entry, or `null` if the entry is not part of the atlases.
 */
AtlasManager.prototype.mergeInfos_ = function(info, hitInfo) {
  return /** @type {ol.AtlasManagerInfo} */ ({
    offsetX: info.offsetX,
    offsetY: info.offsetY,
    image: info.image,
    hitImage: hitInfo.image
  });
};


/**
 * Add an image to the atlas manager.
 *
 * If an entry for the given id already exists, the entry will
 * be overridden (but the space on the atlas graphic will not be freed).
 *
 * If `renderHitCallback` is provided, the image (or the hit-detection version
 * of the image) will be rendered into a separate hit-detection atlas image.
 *
 * @param {string} id The identifier of the entry to add.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {function(CanvasRenderingContext2D, number, number)} renderCallback
 *    Called to render the new image onto an atlas image.
 * @param {function(CanvasRenderingContext2D, number, number)=}
 *    opt_renderHitCallback Called to render a hit-detection image onto a hit
 *    detection atlas image.
 * @param {Object=} opt_this Value to use as `this` when executing
 *    `renderCallback` and `renderHitCallback`.
 * @return {?ol.AtlasManagerInfo}  The position and atlas image for the
 *    entry, or `null` if the image is too big.
 */
AtlasManager.prototype.add = function(id, width, height,
  renderCallback, opt_renderHitCallback, opt_this) {
  if (width + this.space_ > this.maxSize_ ||
      height + this.space_ > this.maxSize_) {
    return null;
  }

  /** @type {?ol.AtlasInfo} */
  const info = this.add_(false,
    id, width, height, renderCallback, opt_this);
  if (!info) {
    return null;
  }

  // even if no hit-detection entry is requested, we insert a fake entry into
  // the hit-detection atlas, to make sure that the offset is the same for
  // the original image and the hit-detection image.
  const renderHitCallback = opt_renderHitCallback !== undefined ?
    opt_renderHitCallback : nullFunction;

  const hitInfo = /** @type {ol.AtlasInfo} */ (this.add_(true,
    id, width, height, renderHitCallback, opt_this));

  return this.mergeInfos_(info, hitInfo);
};


/**
 * @private
 * @param {boolean} isHitAtlas If the hit-detection atlases are used.
 * @param {string} id The identifier of the entry to add.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {function(CanvasRenderingContext2D, number, number)} renderCallback
 *    Called to render the new image onto an atlas image.
 * @param {Object=} opt_this Value to use as `this` when executing
 *    `renderCallback` and `renderHitCallback`.
 * @return {?ol.AtlasInfo}  The position and atlas image for the entry,
 *    or `null` if the image is too big.
 */
AtlasManager.prototype.add_ = function(isHitAtlas, id, width, height,
  renderCallback, opt_this) {
  const atlases = (isHitAtlas) ? this.hitAtlases_ : this.atlases_;
  let atlas, info, i, ii;
  for (i = 0, ii = atlases.length; i < ii; ++i) {
    atlas = atlases[i];
    info = atlas.add(id, width, height, renderCallback, opt_this);
    if (info) {
      return info;
    } else if (!info && i === ii - 1) {
      // the entry could not be added to one of the existing atlases,
      // create a new atlas that is twice as big and try to add to this one.
      let size;
      if (isHitAtlas) {
        size = Math.min(this.currentHitSize_ * 2, this.maxSize_);
        this.currentHitSize_ = size;
      } else {
        size = Math.min(this.currentSize_ * 2, this.maxSize_);
        this.currentSize_ = size;
      }
      atlas = new Atlas(size, this.space_);
      atlases.push(atlas);
      // run the loop another time
      ++ii;
    }
  }
  return null;
};
export default AtlasManager;
