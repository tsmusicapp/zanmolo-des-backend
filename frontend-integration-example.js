// Frontend Integration Example for Deliverables API
// This shows how to integrate the deliverables API with your React frontend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// 1. Get deliverable templates based on selected category
export const getDeliverableTemplates = async (category) => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/services/deliverables/templates/${encodeURIComponent(category)}`);
    if (!response.ok) throw new Error('Failed to fetch templates');
    return await response.json();
  } catch (error) {
    console.error('Error fetching deliverable templates:', error);
    return null;
  }
};

// 2. Create service with deliverables
export const createServiceWithDeliverables = async (serviceData) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/v1/services/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(serviceData)
    });
    
    if (!response.ok) throw new Error('Failed to create service');
    return await response.json();
  } catch (error) {
    console.error('Error creating service:', error);
    throw error;
  }
};

// 3. Update service deliverables
export const updateServiceDeliverables = async (serviceId, deliveryContent) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/v1/services/${serviceId}/deliverables`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(deliveryContent)
    });
    
    if (!response.ok) throw new Error('Failed to update deliverables');
    return await response.json();
  } catch (error) {
    console.error('Error updating deliverables:', error);
    throw error;
  }
};

// 4. React Hook for managing deliverables state
export const useDeliverables = (category) => {
  const [templates, setTemplates] = useState(null);
  const [deliveryParams, setDeliveryParams] = useState({
    deliveryTime: '',
    revisionRounds: 0,
    deliverables: {},
    additionalNotes: ''
  });

  useEffect(() => {
    if (category) {
      getDeliverableTemplates(category).then(templates => {
        if (templates) {
          setTemplates(templates);
          // Set default values
          setDeliveryParams({
            deliveryTime: templates.deliveryTime.default,
            revisionRounds: templates.revisionRounds.default,
            deliverables: templates.deliverables,
            additionalNotes: ''
          });
        }
      });
    }
  }, [category]);

  return {
    templates,
    deliveryParams,
    setDeliveryParams
  };
};

// 5. Example usage in a React component
const ServiceCreationForm = () => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const { templates, deliveryParams, setDeliveryParams } = useDeliverables(selectedCategory);

  const handleSubmit = async (formData) => {
    const serviceData = {
      ...formData,
      deliveryContent: deliveryParams
    };

    try {
      const result = await createServiceWithDeliverables(serviceData);
      console.log('Service created successfully:', result);
      // Handle success (redirect, show message, etc.)
    } catch (error) {
      console.error('Failed to create service:', error);
      // Handle error
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Category selection */}
      <select 
        value={selectedCategory} 
        onChange={(e) => setSelectedCategory(e.target.value)}
      >
        <option value="">Select Category</option>
        <option value="Architecture Design Services">Architecture Design</option>
        <option value="Interior Design Services">Interior Design</option>
        <option value="Product & Industrial Design Services">Product Design</option>
        {/* Add more categories */}
      </select>

      {/* Deliverables configuration */}
      {templates && (
        <div>
          {/* Delivery Time */}
          <select 
            value={deliveryParams.deliveryTime}
            onChange={(e) => setDeliveryParams(prev => ({
              ...prev, 
              deliveryTime: e.target.value
            }))}
          >
            {templates.deliveryTime.options.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          {/* Revision Rounds */}
          <input
            type="number"
            min={templates.revisionRounds.min}
            max={templates.revisionRounds.max}
            value={deliveryParams.revisionRounds}
            onChange={(e) => setDeliveryParams(prev => ({
              ...prev, 
              revisionRounds: parseInt(e.target.value)
            }))}
          />

          {/* Deliverables checkboxes */}
          {Object.entries(templates.deliverables).map(([key, defaultValue]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={deliveryParams.deliverables[key] ?? defaultValue}
                onChange={(e) => setDeliveryParams(prev => ({
                  ...prev,
                  deliverables: {
                    ...prev.deliverables,
                    [key]: e.target.checked
                  }
                }))}
              />
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
            </label>
          ))}

          {/* Additional Notes */}
          <textarea
            value={deliveryParams.additionalNotes}
            onChange={(e) => setDeliveryParams(prev => ({
              ...prev, 
              additionalNotes: e.target.value
            }))}
            placeholder="Add any specific requirements..."
          />
        </div>
      )}

      <button type="submit">Create Service</button>
    </form>
  );
};

// 6. Example service data structure for different categories
export const exampleServiceData = {
  architecture: {
    title: "Professional Architecture Design",
    category: "Architecture Design Services",
    subcategory: "Residential Design",
    description: "Complete architectural design services for residential projects",
    packages: {
      basic: {
        title: "Basic Architecture Package",
        description: "Essential design package with 3D models and drawings",
        price: 800,
        revisions: 3,
        features: ["3D Models", "2D Drawings", "Rendered Images"]
      }
    },
    deliveryContent: {
      deliveryTime: "2-4 weeks",
      revisionRounds: 3,
      deliverables: {
        "3dModels": true,
        "2dDrawings": true,
        "bimFiles": false,
        "renderedImages": true,
        "walkthroughAnimations": false,
        "parametricDesignFiles": false,
        "designReports": true
      },
      additionalNotes: "High-quality architectural designs with detailed documentation"
    }
  },
  
  interior: {
    title: "Modern Interior Design",
    category: "Interior Design Services", 
    subcategory: "Residential Interior",
    description: "Contemporary interior design for modern living spaces",
    packages: {
      basic: {
        title: "Basic Interior Package",
        description: "Complete interior design with 3D visualization",
        price: 600,
        revisions: 2,
        features: ["3D Models", "Layout Drawings", "Material Boards"]
      }
    },
    deliveryContent: {
      deliveryTime: "1 week",
      revisionRounds: 2,
      deliverables: {
        "interior3dModels": true,
        "renderedImages": true,
        "layoutDrawings": true,
        "materialFinishBoards": true,
        "walkthroughAnimations": false
      },
      additionalNotes: "Modern design approach with sustainable materials"
    }
  }
};