import mongoose from 'mongoose';

const LanguageCommandSchema = new mongoose.Schema(
  {
    speaking: { type: String, enum: ['Basic', 'Intermediate', 'Advanced', 'Fluent'], default: '' },
    listening: { type: String, enum: ['Basic', 'Intermediate', 'Advanced', 'Fluent'], default: '' },
    writing: { type: String, enum: ['Basic', 'Intermediate', 'Advanced', 'Fluent'], default: '' }
  },
  { _id: false }
);

const EligibilityAssessmentSchema = new mongoose.Schema(
  {
    personalDetails: {
      fullName: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
      dateOfBirth: { type: String, default: '' },
      countryOfResidence: { type: String, required: true, trim: true },
      nationality: { type: String, default: '' }
    },
    familyDetails: {
      maritalStatus: { type: String, enum: ['Single', 'Married', 'Common-law', 'Divorced', 'Widowed', 'Other'], required: true },
      familyInformation: { type: String, default: '' },
      hasDependentChildren: { type: String, enum: ['Yes', 'No'], required: true },
      dependentChildrenCount: { type: String, default: '' },
      dependentChildrenAges: { type: String, default: '' }
    },
    netWorth: {
      usd: { type: String, required: true },
      inr: { type: String, required: true }
    },
    education: {
      qualification: { type: String, required: true },
      institution: { type: String, required: true },
      graduationYear: { type: String, default: '' },
      relatedToEducation: { type: String, enum: ['Yes', 'No'], required: true }
    },
    workExperience: {
      currentlyWorking: { type: String, enum: ['Yes', 'No'], required: true },
      lastWorkExperience: { type: String, default: '' },
      currentDesignation: { type: String, default: '' },
      currentJobStartDate: { type: String, default: '' }
    },
    languageSkills: {
      english: { type: LanguageCommandSchema, required: true },
      french: { type: LanguageCommandSchema, required: true }
    },
    connections: {
      relativesOrFriends: { type: String, enum: ['Yes', 'No'], required: true },
      visited: { type: String, enum: ['Yes', 'No'], required: true },
      studied: { type: String, enum: ['Yes', 'No'], required: true },
      worked: { type: String, enum: ['Yes', 'No'], required: true },
      writtenJobOffer: { type: String, enum: ['Yes', 'No'], required: true }
    },
    security: {
      familyMedicalCondition: { type: String, enum: ['Yes', 'No'], required: true },
      medicalDetails: { type: String, default: '' },
      criminalConviction: { type: String, enum: ['Yes', 'No'], required: true },
      convictionDetails: { type: String, default: '' }
    },
    consultant: { type: String, enum: ['Tania', 'Consultant 2', 'Consultant 3'], required: true },
    status: {
      type: String,
      enum: ['Pending', 'In Review', 'Contacted', 'Qualified', 'Not Qualified', 'Closed'],
      default: 'Pending'
    },
    adminNotes: { type: String, default: '' }
  },
  { timestamps: true }
);

EligibilityAssessmentSchema.index({ createdAt: -1 });
EligibilityAssessmentSchema.index({
  'personalDetails.fullName': 'text',
  'personalDetails.email': 'text',
  'personalDetails.phone': 'text',
  consultant: 'text'
});

export default mongoose.model('EligibilityAssessment', EligibilityAssessmentSchema);
