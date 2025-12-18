# Deliverables API Documentation

## Overview
The Deliverables API extends the existing gig/service creation system to handle detailed delivery content configuration for different service categories, particularly design services.

## API Endpoints

### 1. Create Service with Deliverables
**POST** `/v1/services/create`

Creates a new service with comprehensive deliverables configuration.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Architecture Design Service",
  "category": "Architecture Design Services",
  "subcategory": "Residential Design",
  "description": "Professional architecture design services",
  "packages": {
    "basic": {
      "title": "Basic Package",
      "description": "Essential design package",
      "price": 500,
      "revisions": 2,
      "features": ["3D Models", "2D Drawings"]
    }
  },
  "deliveryContent": {
    "deliveryTime": "2-4 weeks",
    "revisionRounds": 3,
    "deliverables": {
      "3dModels": true,
      "2dDrawings": true,
      "bimFiles": false,
      "renderedImages": true,
      "walkthroughAnimations": false,
      "parametricDesignFiles": false,
      "designReports": true
    },
    "additionalNotes": "High-quality designs with documentation"
  },
  "tags": ["architecture", "design"],
  "videos": [],
  "requirements": "Please provide site plans"
}
```

### 2. Get Deliverable Templates
**GET** `/v1/services/deliverables/templates/:category`

Returns the default deliverable configuration for a specific service category.

**Example:**
```
GET /v1/services/deliverables/templates/Architecture Design Services
```

**Response:**
```json
{
  "deliveryTime": {
    "label": "Delivery Time",
    "type": "select",
    "options": ["3-5 days", "1-2 weeks", "2-4 weeks", "1-2 months"],
    "default": "1-2 weeks"
  },
  "revisionRounds": {
    "label": "Revision Rounds",
    "type": "number",
    "min": 0,
    "max": 10,
    "default": 3
  },
  "deliverables": {
    "3dModels": true,
    "2dDrawings": true,
    "bimFiles": false,
    "renderedImages": true,
    "walkthroughAnimations": false,
    "parametricDesignFiles": false,
    "designReports": false
  }
}
```

### 3. Update Service Deliverables
**PUT** `/v1/services/:serviceId/deliverables`

Updates the delivery content for an existing service.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "deliveryTime": "1-2 weeks",
  "revisionRounds": 2,
  "deliverables": {
    "3dModels": true,
    "2dDrawings": true,
    "renderedImages": false
  },
  "additionalNotes": "Updated delivery requirements"
}
```

### 4. Enhanced Gig Creation (Existing Endpoint)
**POST** `/v1/gigs`

The existing gig creation endpoint now also supports deliverables data.

## Service Categories and Deliverables

### Architecture Design Services
- **Delivery Options:** 3-5 days, 1-2 weeks, 2-4 weeks, 1-2 months
- **Default Revisions:** 3
- **Deliverables:**
  - 3D Models ✓
  - 2D Drawings (DWG / PDF) ✓
  - BIM Files (RVT / IFC)
  - Rendered Images ✓
  - Walkthrough Animations
  - Parametric Design Files
  - Design Reports

### Interior Design Services
- **Delivery Options:** 2-3 days, 1 week, 2-3 weeks, 1 month
- **Default Revisions:** 2
- **Deliverables:**
  - Interior 3D Models ✓
  - Rendered Images ✓
  - Layout Drawings ✓
  - Material & Finish Boards
  - Walkthrough Animations

### Product & Industrial Design Services
- **Delivery Options:** 1-3 days, 1 week, 2 weeks, 3-4 weeks
- **Default Revisions:** 3
- **Deliverables:**
  - CAD / 3D Model Files ✓
  - Product Renderings ✓
  - Exploded View Images
  - Manufacturing Drawings
  - 3D Print Files

### Environment & Scene Design Services
- **Delivery Options:** 3-5 days, 1-2 weeks, 3-4 weeks, 1-2 months
- **Default Revisions:** 2
- **Deliverables:**
  - Environment Scenes ✓
  - Modular Asset Sets
  - Engine-ready Files (Unreal / Unity)
  - Rendered Images ✓
  - Playable / Viewable Scenes

### Vehicle & Hard-surface Design Services
- **Delivery Options:** 1 week, 2-3 weeks, 1 month, 2 months
- **Default Revisions:** 2
- **Deliverables:**
  - High-poly Models ✓
  - Low-poly Models
  - Texture Sets ✓
  - Vehicle Renderings ✓
  - Animation-ready Files

### Props & Asset Creation Services
- **Delivery Options:** 1-2 days, 3-5 days, 1 week, 2 weeks
- **Default Revisions:** 2
- **Deliverables:**
  - Single 3D Assets ✓
  - Asset Packs
  - PBR Texture Sets ✓
  - Optimized Game Assets

### 3D Visualization & Rendering Services
- **Delivery Options:** 1-2 days, 3-5 days, 1 week, 2-3 weeks
- **Default Revisions:** 3
- **Deliverables:**
  - Still Render Images ✓
  - Real-time Scenes
  - Interactive View Files
  - VR / AR Content

### Animation & Video Design Services
- **Delivery Options:** 3-5 days, 1-2 weeks, 3-4 weeks, 1-2 months
- **Default Revisions:** 2
- **Deliverables:**
  - Video Files ✓
  - Real-time Cinematic Files
  - Motion Graphics Clips

## Database Schema

The `deliveryContent` field is added to the Gig model:

```javascript
deliveryContent: {
  deliveryTime: {
    type: String,
    default: "1 week"
  },
  revisionRounds: {
    type: Number,
    default: 2,
    min: 0,
    max: 10
  },
  deliverables: {
    type: Map,
    of: Boolean,
    default: {}
  },
  additionalNotes: {
    type: String,
    default: ""
  }
}
```

## Frontend Integration

The frontend can use these APIs to:

1. **Get Templates:** Fetch appropriate deliverable options based on selected category
2. **Create Services:** Submit complete service data including deliverables
3. **Update Deliverables:** Allow sellers to modify their delivery content
4. **Display Options:** Show buyers what they'll receive

## Example Frontend Usage

```javascript
// Get deliverable templates for a category
const getDeliverableTemplates = async (category) => {
  const response = await fetch(`/v1/services/deliverables/templates/${encodeURIComponent(category)}`);
  return response.json();
};

// Create service with deliverables
const createService = async (serviceData) => {
  const response = await fetch('/v1/services/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(serviceData)
  });
  return response.json();
};
```

## Testing

Run the test file to verify API functionality:

```bash
node test-deliverables.js
```

This will test:
- Template retrieval for different categories
- Service data structure validation
- API endpoint availability