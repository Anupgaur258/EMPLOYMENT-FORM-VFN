import express from 'express';
import jwt from 'jsonwebtoken';
import Lead from '../models/Lead.js';
import EligibilityAssessment from '../models/EligibilityAssessment.js';
import { isDBConnected } from '../config/db.js';
import { adminAuthMiddleware } from '../middleware/auth.js';
import { streamFileFromDrive, streamLegacyLocalFile } from '../services/googleDrive.js';
import { getPendingSubmissions, deletePendingSubmission } from '../services/syncService.js';

const router = express.Router();

const ELIGIBILITY_STATUSES = ['Pending', 'In Review', 'Contacted', 'Qualified', 'Not Qualified', 'Closed'];

router.get('/eligibility-assessments', adminAuthMiddleware, async (req, res) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is disconnected. Eligibility assessments are unavailable.'
      });
    }

    const { search, status } = req.query;
    const query = {};
    if (status && status !== 'All' && ELIGIBILITY_STATUSES.includes(status)) {
      query.status = status;
    }
    if (typeof search === 'string' && search.trim()) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query.$or = [
        { 'personalDetails.fullName': searchRegex },
        { 'personalDetails.email': searchRegex },
        { 'personalDetails.phone': searchRegex },
        { consultant: searchRegex }
      ];
    }

    const assessments = await EligibilityAssessment.find(query).sort({ createdAt: -1 });
    return res.json({
      success: true,
      count: assessments.length,
      assessments,
      databaseConnected: true
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch eligibility assessments',
      error: error.message
    });
  }
});

router.put('/eligibility-assessments/:id', adminAuthMiddleware, async (req, res) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is disconnected. Cannot update assessment.'
      });
    }

    const updates = {};
    if (req.body.status !== undefined) {
      if (!ELIGIBILITY_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Invalid assessment status.' });
      }
      updates.status = req.body.status;
    }
    if (req.body.adminNotes !== undefined) {
      updates.adminNotes = String(req.body.adminNotes);
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No assessment updates provided.' });
    }

    const assessment = await EligibilityAssessment.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Eligibility assessment not found.' });
    }

    return res.json({ success: true, assessment });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update eligibility assessment',
      error: error.message
    });
  }
});

router.delete('/eligibility-assessments/:id', adminAuthMiddleware, async (req, res) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is disconnected. Cannot delete assessment.'
      });
    }

    const assessment = await EligibilityAssessment.findByIdAndDelete(req.params.id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Eligibility assessment not found.' });
    }
    return res.json({ success: true, message: 'Eligibility assessment deleted.' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete eligibility assessment',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/login
 * Verify admin password from .env and return signed JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const configuredPassword = process.env.ADMIN_PASSWORD;
    const secret = process.env.JWT_SECRET;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    if (!configuredPassword || !secret || secret.length < 32) {
      return res.status(503).json({ success: false, message: 'Admin authentication is not configured securely.' });
    }

    if (password !== configuredPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials. Access denied.'
      });
    }

    const token = jwt.sign({ role: 'admin', loggedInAt: new Date() }, secret, {
      expiresIn: '7d'
    });

    return res.json({
      success: true,
      message: 'Admin authenticated successfully',
      token
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
});

// Stream private Drive documents only after admin authentication.
router.get('/documents/:leadId/:fieldName', adminAuthMiddleware, async (req, res) => {
  try {
    const { leadId, fieldName } = req.params;
    const allowedFields = ['photo', 'updatedCv', 'aadhaarFront', 'aadhaarBack', 'panCard', 'educationalCertificates', 'bankPassbook', 'offerLetter', 'salarySlips', 'bankStatements', 'resignationLetter', 'experienceLetter', 'rentAgreement'];
    if (!allowedFields.includes(fieldName)) return res.status(404).json({ success: false, message: 'Document not found.' });
    let document;
    if (leadId.startsWith('pending_')) {
      const pendingLead = getPendingSubmissions().find((item) => item._id === leadId);
      document = pendingLead?.documents?.[fieldName];
    } else {
      if (!isDBConnected()) return res.status(503).json({ success: false, message: 'Database unavailable.' });
      const lead = await Lead.findById(leadId).select(`documents.${fieldName}`);
      document = lead?.documents?.[fieldName];
    }
    if (!document?.fileId) return res.status(404).json({ success: false, message: 'Document not found.' });
    let metadata;
    let stream;
    if (document.storageType === 'gdrive') {
      ({ metadata, stream } = await streamFileFromDrive(document.fileId));
    } else {
      metadata = { mimeType: document.mimeType };
      stream = streamLegacyLocalFile(document.fileName);
    }
    res.set({
      'Content-Type': metadata.mimeType || document.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.originalName || metadata.name || 'document')}`,
      'Cache-Control': 'private, no-store'
    });
    stream.on('error', (error) => {
      console.error('[Google Drive] Document stream failed:', error.message);
      if (!res.headersSent) res.status(502).end(); else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    console.error('[Google Drive] Document retrieval failed:', error.message);
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Could not retrieve document.' });
  }
});

/**
 * GET /api/admin/stats
 * Dashboard metrics combining MongoDB Atlas and persistent pending submissions
 */
router.get('/stats', adminAuthMiddleware, async (req, res) => {
  try {
    const pendingOffline = getPendingSubmissions();
    const pendingOfflineCount = pendingOffline.length;

    if (!isDBConnected()) {
      return res.json({
        success: true,
        stats: {
          total: pendingOfflineCount,
          pending: pendingOfflineCount,
          inReview: 0,
          shortlisted: 0,
          interviewed: 0,
          selected: 0,
          rejected: 0,
          pendingOfflineSync: pendingOfflineCount
        },
        databaseConnected: false
      });
    }

    const total = await Lead.countDocuments();
    const pending = await Lead.countDocuments({ status: 'Pending' });
    const inReview = await Lead.countDocuments({ status: 'In Review' });
    const shortlisted = await Lead.countDocuments({ status: 'Shortlisted' });
    const interviewed = await Lead.countDocuments({ status: 'Interviewed' });
    const selected = await Lead.countDocuments({ status: 'Selected' });
    const rejected = await Lead.countDocuments({ status: 'Rejected' });

    res.json({
      success: true,
      stats: {
        total: total + pendingOfflineCount,
        pending: pending + pendingOfflineCount,
        inReview,
        shortlisted,
        interviewed,
        selected,
        rejected,
        pendingOfflineSync: pendingOfflineCount
      },
      databaseConnected: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/leads
 * Get all leads sorted newest first (createdAt: -1) with sync status
 */
router.get('/leads', adminAuthMiddleware, async (req, res) => {
  try {
    const { search, status } = req.query;
    const pendingOffline = getPendingSubmissions();

    let dbLeads = [];
    if (isDBConnected()) {
      const query = {};

      if (status && status !== 'All') {
        query.status = status;
      }

      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { fullName: searchRegex },
          { emailId: searchRegex },
          { mobileNo: searchRegex },
          { positionJoiningFor: searchRegex },
          { aadhaarNo: searchRegex }
        ];
      }

      dbLeads = await Lead.find(query).sort({ createdAt: -1 });
    }

    // Filter pending offline leads matching query
    let filteredPending = pendingOffline;
    if (status && status !== 'All') {
      filteredPending = filteredPending.filter((l) => l.status === status);
    }
    if (search && search.trim()) {
      const s = search.toLowerCase();
      filteredPending = filteredPending.filter(
        (l) =>
          (l.fullName && l.fullName.toLowerCase().includes(s)) ||
          (l.emailId && l.emailId.toLowerCase().includes(s)) ||
          (l.mobileNo && l.mobileNo.includes(s)) ||
          (l.positionJoiningFor && l.positionJoiningFor.toLowerCase().includes(s)) ||
          (l.aadhaarNo && l.aadhaarNo.includes(s))
      );
    }

    // Combine: Unsynced pending leads displayed at the top
    const combinedLeads = [...filteredPending, ...dbLeads];

    res.json({
      success: true,
      count: combinedLeads.length,
      leads: combinedLeads,
      databaseConnected: isDBConnected(),
      pendingOfflineCount: pendingOffline.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/leads/:id
 * Get complete details of a specific candidate lead
 */
router.get('/leads/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check pending offline submissions first if id starts with pending_
    if (id.startsWith('pending_')) {
      const pending = getPendingSubmissions();
      const match = pending.find((p) => p._id === id);
      if (match) {
        return res.json({ success: true, lead: match, source: 'offline_queue' });
      }
    }

    if (isDBConnected()) {
      const lead = await Lead.findById(id);
      if (lead) {
        return res.json({ success: true, lead, source: 'mongodb' });
      }
    }

    // Fallback: check pending queue by ID
    const pending = getPendingSubmissions();
    const match = pending.find((p) => p._id === id || p.clientSubmissionId === id);
    if (match) {
      return res.json({ success: true, lead: match, source: 'offline_queue' });
    }

    return res.status(404).json({ success: false, message: 'Lead not found' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead details',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/leads/:id
 * Update status, notes, or lead details
 */
router.put('/leads/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('pending_')) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify lead while pending synchronization to database.'
      });
    }

    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is disconnected. Cannot update lead at this time.'
      });
    }

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedLead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead updated successfully',
      lead: updatedLead
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update lead',
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/leads/:id
 * Delete the lead record while retaining associated Drive files.
 */
router.delete('/leads/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('pending_')) {
      const removed = deletePendingSubmission(id);
      if (removed) {
        return res.json({ success: true, message: 'Pending lead removed from queue' });
      }
      return res.status(404).json({ success: false, message: 'Lead not found in pending queue' });
    }

    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database is disconnected. Cannot delete lead from database at this time.'
      });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    await Lead.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Lead deleted. Associated Google Drive files were retained.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete lead',
      error: error.message
    });
  }
});

export default router;
