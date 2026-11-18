import express from 'express';
import crypto from 'crypto';
import EligibilityAssessment from '../models/EligibilityAssessment.js';
import { isDBConnected } from '../config/db.js';

const router = express.Router();
const CAPTCHA_LIFETIME_MS = 5 * 60 * 1000;
const fallbackCaptchaSecret = crypto.randomBytes(32).toString('hex');
const usedCaptchaChallenges = new Map();
const requiredAnswers = [
  'familyDetails.hasDependentChildren',
  'education.relatedToEducation',
  'workExperience.currentlyWorking',
  'connections.relativesOrFriends',
  'connections.visited',
  'connections.studied',
  'connections.worked',
  'connections.writtenJobOffer',
  'security.familyMedicalCondition',
  'security.criminalConviction'
];

const getValue = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const getCaptchaSecret = () => process.env.CAPTCHA_SECRET || process.env.JWT_SECRET || fallbackCaptchaSecret;

const createCaptchaChallenge = () => {
  const first = Math.floor(Math.random() * 8) + 2;
  const second = Math.floor(Math.random() * 8) + 2;
  const answer = first + second;
  const issuedAt = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', getCaptchaSecret())
    .update(`${nonce}:${issuedAt}:${answer}`)
    .digest('hex');

  for (const [usedNonce, expiry] of usedCaptchaChallenges) {
    if (expiry <= Date.now()) usedCaptchaChallenges.delete(usedNonce);
  }

  return { first, second, token: `${nonce}.${issuedAt}.${signature}` };
};

const verifyCaptcha = (captcha) => {
  if (!captcha || !/^\d+$/.test(String(captcha.answer)) || typeof captcha.token !== 'string') {
    return false;
  }

  const [nonce, issuedAt, signature, ...extra] = captcha.token.split('.');
  const timestamp = Number(issuedAt);
  if (
    extra.length ||
    !/^[a-f0-9]{32}$/.test(nonce || '') ||
    !/^\d+$/.test(issuedAt || '') ||
    !/^[a-f0-9]{64}$/.test(signature || '') ||
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > CAPTCHA_LIFETIME_MS ||
    timestamp > Date.now() ||
    usedCaptchaChallenges.has(nonce)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', getCaptchaSecret())
    .update(`${nonce}:${issuedAt}:${captcha.answer}`)
    .digest();
  const received = Buffer.from(signature, 'hex');
  if (!crypto.timingSafeEqual(expected, received)) return false;

  usedCaptchaChallenges.set(nonce, timestamp + CAPTCHA_LIFETIME_MS);
  return true;
};

router.get('/challenge', (req, res) => {
  return res.json({ success: true, challenge: createCaptchaChallenge() });
});

router.post('/', async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      message: 'The database is temporarily unavailable. Please try again shortly.'
    });
  }

  if (!verifyCaptcha(req.body?.captcha)) {
    return res.status(400).json({
      success: false,
      message: 'Verification answer is incorrect or expired. Please refresh the verification question.'
    });
  }

  const { personalDetails, familyDetails, netWorth, education, workExperience, languageSkills, connections, security, consultant } =
    req.body || {};
  const assessmentData = {
    personalDetails,
    familyDetails,
    netWorth,
    education,
    workExperience,
    languageSkills,
    connections,
    security,
    consultant
  };

  const requiredFields = [
    'personalDetails.fullName',
    'personalDetails.email',
    'personalDetails.phone',
    'personalDetails.countryOfResidence',
    'familyDetails.maritalStatus',
    'familyDetails.hasDependentChildren',
    'netWorth.usd',
    'netWorth.inr',
    'education.qualification',
    'education.institution',
    'education.relatedToEducation',
    'workExperience.currentlyWorking',
    'languageSkills.english.speaking',
    'languageSkills.english.listening',
    'languageSkills.english.writing',
    'languageSkills.french.speaking',
    'languageSkills.french.listening',
    'languageSkills.french.writing',
    'security.familyMedicalCondition',
    'security.criminalConviction',
    'consultant'
  ];

  if (requiredAnswers.concat(requiredFields).some((field) => !String(getValue(assessmentData, field) || '').trim())) {
    return res.status(400).json({ success: false, message: 'Please complete all required assessment fields.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalDetails.email.trim())) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  const invalidAnswer = requiredAnswers.find((field) => !['Yes', 'No'].includes(getValue(assessmentData, field)));
  if (invalidAnswer) {
    return res.status(400).json({ success: false, message: 'Please answer each required Yes / No question.' });
  }

  const allowedSkillLevels = ['Basic', 'Intermediate', 'Advanced', 'Fluent'];
  const languageScores = [
    languageSkills.english.speaking,
    languageSkills.english.listening,
    languageSkills.english.writing,
    languageSkills.french.speaking,
    languageSkills.french.listening,
    languageSkills.french.writing
  ];
  if (languageScores.some((score) => !allowedSkillLevels.includes(score))) {
    return res.status(400).json({ success: false, message: 'Please select valid language skill levels.' });
  }

  if (
    !/^\d+(?:\.\d+)?$/.test(netWorth.usd) ||
    !/^\d+(?:\.\d+)?$/.test(netWorth.inr)
  ) {
    return res.status(400).json({ success: false, message: 'Net worth must be a non-negative number.' });
  }

  if (
    workExperience.currentlyWorking === 'Yes' &&
    (!workExperience.currentDesignation?.trim() || !workExperience.currentJobStartDate)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Current designation and start date are required for current employment.'
    });
  }

  if (workExperience.currentlyWorking === 'No' && !workExperience.lastWorkExperience?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please enter your last work experience.'
    });
  }

  try {
    const assessment = await EligibilityAssessment.create(assessmentData);
    return res.status(201).json({
      success: true,
      message: 'Eligibility assessment submitted successfully.',
      assessmentId: assessment._id
    });
  } catch (error) {
    console.error('[Eligibility API] Error creating assessment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit eligibility assessment.'
    });
  }
});

export default router;
