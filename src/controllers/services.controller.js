const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { servicesService } = require('../services');
const ApiError = require('../utils/ApiError');

const createServiceWithDeliverables = catchAsync(async (req, res) => {
  const mongoose = require('mongoose');
  const serviceData = {
    ...req.body,
    seller: new mongoose.Types.ObjectId(req.user.id)
  };

  // Handle deliverables data
  if (req.body.deliveryContent) {
    serviceData.deliveryContent = {
      deliveryTime: req.body.deliveryContent.deliveryTime || '1 week',
      revisionRounds: parseInt(req.body.deliveryContent.revisionRounds) || 2,
      deliverables: req.body.deliveryContent.deliverables || {},
      additionalNotes: req.body.deliveryContent.additionalNotes || ''
    };
  }

  const service = await servicesService.createServiceWithDeliverables(serviceData);
  res.status(httpStatus.CREATED).send(service);
});

const getDeliverableTemplates = catchAsync(async (req, res) => {
  const { category } = req.params;
  const templates = servicesService.getDeliverableTemplatesByCategory(category);
  res.send(templates);
});

const updateServiceDeliverables = catchAsync(async (req, res) => {
  const { serviceId } = req.params;
  const deliveryContent = req.body;
  
  const updatedService = await servicesService.updateServiceDeliverables(
    serviceId, 
    deliveryContent, 
    req.user.id
  );
  
  res.send(updatedService);
});

module.exports = {
  createServiceWithDeliverables,
  getDeliverableTemplates,
  updateServiceDeliverables
};