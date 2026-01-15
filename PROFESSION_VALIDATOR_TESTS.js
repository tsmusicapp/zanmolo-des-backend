/**
 * Profession Validator - Testing & Verification Guide
 * 
 * This file provides test cases and scenarios to verify the profession/skills
 * consistency implementation works correctly.
 */

// Test cases for validateGigAgainstProfile

const testCases = [
  {
    name: "Valid: Animator uploading animation gig",
    input: {
      category: "Animation & Video Design Services",
      subcategory: "",
      creationOccupation: ["Animator"],
      businessOccupation: ""
    },
    expected: {
      isValid: true,
      message: "Work category matches your profile profession"
    }
  },
  {
    name: "Valid: 3D Generalist uploading 3D visualization",
    input: {
      category: "3D Visualization & Rendering Services",
      subcategory: "",
      creationOccupation: ["3D Generalist"],
      businessOccupation: ""
    },
    expected: {
      isValid: true,
      message: "Work category matches your profile profession"
    }
  },
  {
    name: "Valid: Audio Engineer uploading audio engineering gig",
    input: {
      category: "audio-engineering",
      subcategory: "",
      creationOccupation: [],
      businessOccupation: "Audio Engineer"
    },
    expected: {
      isValid: true,
      message: "Work category matches your profile profession"
    }
  },
  {
    name: "Valid: Multiple occupations with match",
    input: {
      category: "music-production",
      subcategory: "",
      creationOccupation: ["Vocalist", "Producer", "Sound Engineer"],
      businessOccupation: ""
    },
    expected: {
      isValid: true,
      message: "Work category matches your profile profession"
    }
  },
  {
    name: "Invalid: Vocalist uploading architecture gig",
    input: {
      category: "Architecture Design Services",
      subcategory: "",
      creationOccupation: ["Vocalist"],
      businessOccupation: ""
    },
    expected: {
      isValid: false,
      message: "The work category \"Architecture Design Services\" does not match your profile profession"
    }
  },
  {
    name: "Invalid: Missing profession, uploading gig",
    input: {
      category: "music-production",
      subcategory: "",
      creationOccupation: [],
      businessOccupation: ""
    },
    expected: {
      isValid: false,
      message: "Please set your profession"
    }
  },
  {
    name: "Valid: 3D Artist uploading interior design (3D related)",
    input: {
      category: "Interior Design Services",
      subcategory: "",
      creationOccupation: ["3D Generalist"],
      businessOccupation: "3D Artist"
    },
    expected: {
      isValid: true,
      message: "Work category matches your profile profession"
    }
  },
  {
    name: "Invalid: Designer uploading music production",
    input: {
      category: "music-production",
      subcategory: "",
      creationOccupation: ["Product Designer"],
      businessOccupation: ""
    },
    expected: {
      isValid: false,
      message: "The work category \"music-production\" does not match your profile profession"
    }
  },
];

/**
 * Manual Testing Checklist
 * 
 * Frontend:
 * --------
 * [ ] User creates profile with single occupation (e.g., "Animator")
 * [ ] Frontend validates occupation is selected
 * [ ] User tries to submit without selecting occupation - sees error
 * [ ] User updates profile with new occupation - validation passes
 * [ ] Error messages are clear and helpful
 * 
 * Backend - Profile Creation:
 * ---------------------------
 * [ ] POST /v1/user-space/add with valid occupation succeeds
 * [ ] POST /v1/user-space/add without occupation returns 400 error
 * [ ] POST /v1/user-space/add with empty occupation array returns error
 * [ ] Profession metadata synced to User model
 * [ ] Subsequent queries use denormalized User.professionMetadata
 * 
 * Backend - Profile Update:
 * -------------------------
 * [ ] PATCH /v1/user-space/update with valid occupation succeeds
 * [ ] PATCH /v1/user-space/update to remove occupation returns error
 * [ ] Profession metadata updated in User model
 * [ ] Old profession metadata cleared properly
 * 
 * Backend - Gig Creation:
 * -----------------------
 * [ ] User with "Animator" can create "Animation & Video Design" gig
 * [ ] User with "3D Generalist" can create "3D Visualization" gig
 * [ ] User with "Vocalist" cannot create "Architecture Design" gig
 * [ ] User without profession cannot create any gig
 * [ ] Error message includes expected professions for category
 * [ ] professionValidationStatus is set to 'valid' on successful creation
 * 
 * Backend - Gig Update:
 * --------------------
 * [ ] Gig category change to matching profession succeeds
 * [ ] Gig category change to non-matching profession fails
 * [ ] professionValidationStatus updated on category change
 * [ ] Other gig updates (title, price, etc.) work without validation
 * 
 * Cross-Feature:
 * ----------------
 * [ ] User can update profession after gig creation
 * [ ] Existing gigs don't become invalid when profession changes
 * [ ] New gigs respect the updated profession
 * [ ] Fuzzy matching works (e.g., "Sound Engineer" ≈ "Audio Engineer")
 * 
 * API Response Examples:
 * ----------------------
 */

// API Response Examples:

const validGigCreationResponse = {
  _id: "507f1f77bcf86cd799439011",
  title: "Professional Animation Services",
  category: "Animation & Video Design Services",
  seller: "507f1f77bcf86cd799439012",
  status: "draft",
  professionValidationStatus: "valid",
  // ... other gig fields
};

const invalidGigCreationResponse = {
  message: "The work category \"Architecture Design Services\" does not match your profile profession. Your profile shows: Animator, Video Editor. Please ensure your profile profession matches the work you're uploading.",
  status: 400
};

const missingProfessionResponse = {
  message: "Please set your profession or occupation in your profile before uploading work. You must have at least one creation occupation or business occupation.",
  status: 400
};

const professionValidationErrorResponse = {
  message: "Please complete your profession information",
  status: 400
};

/**
 * Debugging Tips
 * ---------------
 * 
 * 1. Check User.professionMetadata is being populated:
 *    db.users.findOne({_id: ObjectId("...")}).professionMetadata
 * 
 * 2. Check UserSpace profession fields:
 *    db.userspaces.findOne({createdBy: "..."})
 * 
 * 3. Check Gig validation status:
 *    db.gigs.findOne({_id: ObjectId("...")}).professionValidationStatus
 * 
 * 4. Test with curl:
 *    
 *    // Create user space
 *    curl -X POST http://localhost:3000/v1/user-space/add \
 *      -H "Content-Type: application/json" \
 *      -H "Authorization: Bearer YOUR_TOKEN" \
 *      -d '{
 *        "firstName": "John",
 *        "lastName": "Doe",
 *        "creationOccupation": ["Animator"],
 *        "address": "123 Main St"
 *      }'
 * 
 *    // Create gig
 *    curl -X POST http://localhost:3000/v1/gigs \
 *      -H "Content-Type: application/json" \
 *      -H "Authorization: Bearer YOUR_TOKEN" \
 *      -d '{
 *        "title": "Animation Services",
 *        "category": "Animation & Video Design Services",
 *        "description": "Professional animation"
 *      }'
 */

module.exports = {
  testCases,
  validGigCreationResponse,
  invalidGigCreationResponse,
  missingProfessionResponse,
  professionValidationErrorResponse
};
