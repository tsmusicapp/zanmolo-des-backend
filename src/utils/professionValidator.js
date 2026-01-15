/**
 * Profession/Skills Validator
 * Ensures consistency between user profile profession and uploaded work/gigs
 */

const ApiError = require('./ApiError');
const httpStatus = require('http-status');

/**
 * Validate that a gig/work category matches the user's profile profession
 * @param {string} category - The gig category
 * @param {string} subcategory - The gig subcategory
 * @param {Array<string>} creationOccupation - User's creation occupations (from userSpace)
 * @param {string} businessOccupation - User's business occupation (from userSpace)
 * @returns {Object} Validation result with isValid and message
 */
const validateGigAgainstProfile = (category, subcategory, creationOccupation = [], businessOccupation = '') => {
  // Define category to profession mappings
  const categoryToOccupationMap = {
    // Music categories
    'music-production': ['Producer', 'Music Producer', 'Audio Engineer'],
    'mixing-mastering': ['Audio Engineer', 'Sound Engineer', 'Mixing Engineer'],
    'songwriting': ['Songwriter', 'Composer', 'Music Writer'],
    'vocal-recording': ['Vocalist', 'Singer', 'Vocal Engineer'],
    'beat-making': ['Beat Maker', 'Producer', 'Music Producer'],
    'lyrics-writing': ['Lyricist', 'Songwriter', 'Music Writer'],
    'voice-over': ['Voice Actor', 'Voiceover Artist', 'Sound Engineer'],
    'podcast-editing': ['Podcast Producer', 'Audio Editor', 'Sound Engineer'],
    'sound-design': ['Sound Designer', 'Audio Engineer', 'Sound Engineer'],
    'jingle-creation': ['Composer', 'Music Producer', 'Jingle Writer'],
    'instruments': ['Musician', 'Instrumentalist', 'Session Musician'],
    'composition': ['Composer', 'Music Composer', 'Arranger'],
    'vocals': ['Vocalist', 'Singer', 'Session Vocalist'],
    'audio-engineering': ['Audio Engineer', 'Sound Engineer', 'Mixing Engineer'],

    // Design categories
    'Architecture Design Services': ['3D Generalist', 'Architect', 'Product Designer', 'Industrial Designer'],
    'Interior Design Services': ['Interior Designer', '3D Generalist', 'Visualization Artist'],
    'Product & Industrial Design Services': ['Product Designer', 'Industrial Designer', '3D Generalist'],
    'Environment & Scene Design Services': ['Environment Artist', 'Scene Designer', '3D Generalist'],
    'Vehicle & Hard-surface Design Services': ['Hard Surface Modeler', 'Vehicle Designer', '3D Generalist'],
    'Props & Asset Creation Services': ['Asset Creator', '3D Modeler', '3D Generalist'],
    '3D Visualization & Rendering Services': ['3D Generalist', 'Visualization Artist', 'Rendering Artist'],
    'Animation & Video Design Services': ['Animator', '3D Animator', 'Video Editor', 'Motion Designer'],

    'other': [], // No specific validation for 'other'
  };

  // Get expected occupations for this category
  const expectedOccupations = categoryToOccupationMap[category] || [];

  // If no mapping exists and category is not 'other', consider it valid (new categories might not have mapping yet)
  if (expectedOccupations.length === 0 && category !== 'other') {
    return {
      isValid: true,
      message: 'Category validation not configured yet',
      warning: true
    };
  }

  // Normalize occupations for comparison (lowercase, trim)
  const normalizedCreationOccupations = Array.isArray(creationOccupation)
    ? creationOccupation.map(occ => occ?.toLowerCase().trim()).filter(Boolean)
    : [];
  
  const normalizedBusinessOccupation = businessOccupation
    ? businessOccupation.toLowerCase().trim()
    : '';

  const normalizedExpectedOccupations = expectedOccupations.map(occ => occ.toLowerCase().trim());

  // Check if any creation occupation matches expected occupations
  const hasMatchingCreationOccupation = normalizedCreationOccupations.some(creationOcc =>
    normalizedExpectedOccupations.some(expectedOcc => 
      creationOcc.includes(expectedOcc) || expectedOcc.includes(creationOcc)
    )
  );

  // Check if business occupation matches expected occupations
  const hasMatchingBusinessOccupation = normalizedBusinessOccupation &&
    normalizedExpectedOccupations.some(expectedOcc =>
      normalizedBusinessOccupation.includes(expectedOcc) || expectedOcc.includes(normalizedBusinessOccupation)
    );

  // Validation passes if at least one occupation matches
  if (hasMatchingCreationOccupation || hasMatchingBusinessOccupation) {
    return {
      isValid: true,
      message: 'Work category matches your profile profession'
    };
  }

  // Return invalid with helpful message
  return {
    isValid: false,
    message: `The work category "${category}" does not match your profile profession. Your profile shows: ${[...normalizedCreationOccupations, normalizedBusinessOccupation].filter(Boolean).join(', ') || 'No profession set'}. Please ensure your profile profession matches the work you're uploading.`,
    expectedOccupations: normalizedExpectedOccupations,
    userOccupations: [...normalizedCreationOccupations, normalizedBusinessOccupation].filter(Boolean)
  };
};

/**
 * Ensure profession fields are not empty and properly formatted
 * @param {Array<string>} creationOccupation - Creation occupation
 * @param {string} businessOccupation - Business occupation
 * @returns {Object} Validation result
 */
const validateProfessionFields = (creationOccupation, businessOccupation) => {
  const creationOccupationArray = Array.isArray(creationOccupation)
    ? creationOccupation.filter(occ => occ && occ.trim())
    : [];

  const businessOccupationTrimmed = businessOccupation
    ? businessOccupation.trim()
    : '';

  if (creationOccupationArray.length === 0 && !businessOccupationTrimmed) {
    return {
      isValid: false,
      message: 'Please set your profession or occupation in your profile before uploading work. You must have at least one creation occupation or business occupation.'
    };
  }

  return {
    isValid: true,
    creationOccupation: creationOccupationArray,
    businessOccupation: businessOccupationTrimmed
  };
};

/**
 * Sync profession data from userSpace to User model
 * @param {string} userId - User ID
 * @param {Object} userSpaceData - UserSpace data with creationOccupation and businessOccupation
 * @returns {Object} Synced data
 */
const syncProfessionToUserModel = (userId, userSpaceData) => {
  const syncedData = {};

  if (userSpaceData.creationOccupation || userSpaceData.businessOccupation) {
    // Create a displayable profession string
    const professions = [];
    
    if (Array.isArray(userSpaceData.creationOccupation) && userSpaceData.creationOccupation.length > 0) {
      professions.push(...userSpaceData.creationOccupation);
    }
    
    if (userSpaceData.businessOccupation && userSpaceData.businessOccupation.trim()) {
      professions.push(userSpaceData.businessOccupation);
    }

    // Store profession metadata in User model for easy access
    if (professions.length > 0) {
      syncedData.professionMetadata = {
        creationOccupations: Array.isArray(userSpaceData.creationOccupation) 
          ? userSpaceData.creationOccupation 
          : [],
        businessOccupation: userSpaceData.businessOccupation || '',
        displayProfession: [...new Set(professions)].join(', '), // Remove duplicates
        lastUpdated: new Date()
      };
    }
  }

  return syncedData;
};

module.exports = {
  validateGigAgainstProfile,
  validateProfessionFields,
  syncProfessionToUserModel
};
