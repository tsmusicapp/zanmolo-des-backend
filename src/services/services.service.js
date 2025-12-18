const httpStatus = require('http-status');
const { Gig } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a service with deliverables
 * @param {Object} serviceBody
 * @returns {Promise<Gig>}
 */
const createServiceWithDeliverables = async (serviceBody) => {
  try {
    // Handle backward compatibility: transform flat structure to packages structure
    if (serviceBody.price && !serviceBody.packages) {
      const { price, revisions, features, ...restBody } = serviceBody;
      
      serviceBody = {
        ...restBody,
        packages: {
          basic: {
            title: "Basic Package",
            description: "Basic service package",
            price: price,
            revisions: revisions || 1,
            features: features || []
          }
        }
      };
    }

    // Set default deliverables based on category if not provided
    if (!serviceBody.deliveryContent || !serviceBody.deliveryContent.deliverables) {
      const defaultDeliverables = getDefaultDeliverablesByCategory(serviceBody.category, serviceBody.subcategory);
      serviceBody.deliveryContent = {
        ...serviceBody.deliveryContent,
        deliverables: defaultDeliverables.deliverables,
        deliveryTime: serviceBody.deliveryContent?.deliveryTime || defaultDeliverables.deliveryTime.default,
        revisionRounds: serviceBody.deliveryContent?.revisionRounds || defaultDeliverables.revisionRounds.default
      };
    }

    const result = await Gig.create(serviceBody);
    return result;
  } catch (error) {
    console.error('Service creation failed:', error.message);
    throw error;
  }
};

/**
 * Get deliverable templates by category
 * @param {string} category
 * @returns {Object}
 */
const getDeliverableTemplatesByCategory = (category) => {
  return getDefaultDeliverablesByCategory(category);
};

/**
 * Update service deliverables
 * @param {string} serviceId
 * @param {Object} deliveryContent
 * @param {string} userId
 * @returns {Promise<Gig>}
 */
const updateServiceDeliverables = async (serviceId, deliveryContent, userId) => {
  const service = await Gig.findById(serviceId);
  
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Service not found');
  }

  // Check if user is the seller
  if (service.seller.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only update your own services');
  }

  service.deliveryContent = {
    deliveryTime: deliveryContent.deliveryTime || service.deliveryContent?.deliveryTime || '1 week',
    revisionRounds: parseInt(deliveryContent.revisionRounds) || service.deliveryContent?.revisionRounds || 2,
    deliverables: deliveryContent.deliverables || service.deliveryContent?.deliverables || {},
    additionalNotes: deliveryContent.additionalNotes || service.deliveryContent?.additionalNotes || ''
  };

  await service.save();
  return service;
};

/**
 * Get default deliverables configuration by category
 * @param {string} category
 * @param {string} subcategory
 * @returns {Object}
 */
const getDefaultDeliverablesByCategory = (category = '', subcategory = '') => {
  const categoryKey = category.toLowerCase();
  const subcategoryKey = subcategory.toLowerCase();

  // Architecture Design Services
  if (categoryKey.includes('architecture') || subcategoryKey.includes('architecture')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['3-5 days', '1-2 weeks', '2-4 weeks', '1-2 months'], 
        default: '1-2 weeks' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 10, 
        default: 3 
      },
      deliverables: {
        '3dModels': true,
        '2dDrawings': true,
        'bimFiles': false,
        'renderedImages': true,
        'walkthroughAnimations': false,
        'parametricDesignFiles': false,
        'designReports': false
      }
    };
  }

  // Interior Design Services
  if (categoryKey.includes('interior') || subcategoryKey.includes('interior')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['2-3 days', '1 week', '2-3 weeks', '1 month'], 
        default: '1 week' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 8, 
        default: 2 
      },
      deliverables: {
        'interior3dModels': true,
        'renderedImages': true,
        'layoutDrawings': true,
        'materialFinishBoards': false,
        'walkthroughAnimations': false
      }
    };
  }

  // Product & Industrial Design Services
  if (categoryKey.includes('product') || categoryKey.includes('industrial') || subcategoryKey.includes('product')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['1-3 days', '1 week', '2 weeks', '3-4 weeks'], 
        default: '1 week' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 6, 
        default: 3 
      },
      deliverables: {
        'cad3dModelFiles': true,
        'productRenderings': true,
        'explodedViewImages': false,
        'manufacturingDrawings': false,
        '3dPrintFiles': false
      }
    };
  }

  // Environment & Scene Design Services
  if (categoryKey.includes('environment') || categoryKey.includes('scene') || subcategoryKey.includes('environment')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['3-5 days', '1-2 weeks', '3-4 weeks', '1-2 months'], 
        default: '2 weeks' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 5, 
        default: 2 
      },
      deliverables: {
        'environmentScenes': true,
        'modularAssetSets': false,
        'engineReadyFiles': false,
        'renderedImages': true,
        'playableViewableScenes': false
      }
    };
  }

  // Vehicle & Hard-surface Design Services
  if (categoryKey.includes('vehicle') || categoryKey.includes('hard-surface') || subcategoryKey.includes('vehicle')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['1 week', '2-3 weeks', '1 month', '2 months'], 
        default: '2-3 weeks' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 4, 
        default: 2 
      },
      deliverables: {
        'highPolyModels': true,
        'lowPolyModels': false,
        'textureSets': true,
        'vehicleRenderings': true,
        'animationReadyFiles': false
      }
    };
  }

  // Props & Asset Creation Services
  if (categoryKey.includes('props') || categoryKey.includes('asset') || subcategoryKey.includes('props')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['1-2 days', '3-5 days', '1 week', '2 weeks'], 
        default: '3-5 days' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 5, 
        default: 2 
      },
      deliverables: {
        'single3dAssets': true,
        'assetPacks': false,
        'pbrTextureSets': true,
        'optimizedGameAssets': false
      }
    };
  }

  // 3D Visualization & Rendering Services
  if (categoryKey.includes('visualization') || categoryKey.includes('rendering') || subcategoryKey.includes('visualization')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['1-2 days', '3-5 days', '1 week', '2-3 weeks'], 
        default: '3-5 days' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 6, 
        default: 3 
      },
      deliverables: {
        'stillRenderImages': true,
        'realTimeScenes': false,
        'interactiveViewFiles': false,
        'vrArContent': false
      }
    };
  }

  // Animation & Video Design Services
  if (categoryKey.includes('animation') || categoryKey.includes('video') || subcategoryKey.includes('animation')) {
    return {
      deliveryTime: { 
        label: 'Delivery Time', 
        type: 'select', 
        options: ['3-5 days', '1-2 weeks', '3-4 weeks', '1-2 months'], 
        default: '1-2 weeks' 
      },
      revisionRounds: { 
        label: 'Revision Rounds', 
        type: 'number', 
        min: 0, 
        max: 4, 
        default: 2 
      },
      deliverables: {
        'videoFiles': true,
        'realTimeCinematicFiles': false,
        'motionGraphicsClips': false
      }
    };
  }

  // Default/Fallback for Music Services or others
  return {
    deliveryTime: { 
      label: 'Delivery Time', 
      type: 'select', 
      options: ['1-3 days', '1 week', '2 weeks', '1 month'], 
      default: '1 week' 
    },
    revisionRounds: { 
      label: 'Revision Rounds', 
      type: 'number', 
      min: 0, 
      max: 5, 
      default: 2 
    },
    deliverables: {
      'finalFiles': true,
      'sourceFiles': false,
      'additionalFormats': false
    }
  };
};

module.exports = {
  createServiceWithDeliverables,
  getDeliverableTemplatesByCategory,
  updateServiceDeliverables,
  getDefaultDeliverablesByCategory
};