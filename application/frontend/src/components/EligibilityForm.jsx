import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const skillLevels = ['Basic', 'Intermediate', 'Advanced', 'Fluent'];
const consultants = ['Tania', 'Consultant 2', 'Consultant 3'];

const createInitialForm = () => ({
  personalDetails: {
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    countryOfResidence: '',
    nationality: ''
  },
  familyDetails: {
    maritalStatus: '',
    familyInformation: '',
    hasDependentChildren: '',
    dependentChildrenCount: '',
    dependentChildrenAges: ''
  },
  netWorth: { usd: '', inr: '' },
  education: {
    qualification: '',
    institution: '',
    graduationYear: '',
    relatedToEducation: ''
  },
  workExperience: {
    currentlyWorking: '',
    lastWorkExperience: '',
    currentDesignation: '',
    currentJobStartDate: ''
  },
  languageSkills: {
    english: { speaking: '', listening: '', writing: '' },
    french: { speaking: '', listening: '', writing: '' }
  },
  connections: {
    relativesOrFriends: '',
    visited: '',
    studied: '',
    worked: '',
    writtenJobOffer: ''
  },
  security: {
    familyMedicalCondition: '',
    medicalDetails: '',
    criminalConviction: '',
    convictionDetails: ''
  },
  consultant: ''
});

const requestCaptchaChallenge = async () => {
  const response = await fetch(`${API_BASE_URL}/eligibility-assessments/challenge`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.challenge?.token) {
    throw new Error(data.message || 'Could not load the verification question.');
  }
  return data.challenge;
};

function Field({ label, required, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function TextInput({ value, onChange, type = 'text', required, placeholder, min, step }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      placeholder={placeholder}
      min={min}
      step={step}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
    />
  );
}

function SelectInput({ value, onChange, options, required, placeholder = 'Select an option' }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

export default function EligibilityForm() {
  const [form, setForm] = useState(createInitialForm);
  const [challenge, setChallenge] = useState(null);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const refreshChallenge = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError('');
    try {
      setChallenge(await requestCaptchaChallenge());
      setCaptchaAnswer('');
    } catch (error) {
      setCaptchaError(error.message || 'Could not load the verification question.');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    requestCaptchaChallenge()
      .then((loadedChallenge) => {
        if (active) setChallenge(loadedChallenge);
      })
      .catch((error) => {
        if (active) setCaptchaError(error.message || 'Could not load the verification question.');
      })
      .finally(() => {
        if (active) setCaptchaLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const update = (section, field, value) => {
    setForm((current) => ({
      ...current,
      [section]: { ...current[section], [field]: value }
    }));
  };

  const updateSkill = (language, skill, value) => {
    setForm((current) => ({
      ...current,
      languageSkills: {
        ...current.languageSkills,
        [language]: { ...current.languageSkills[language], [skill]: value }
      }
    }));
  };

  const validate = () => {
    const requiredAnswers = [
      form.familyDetails.hasDependentChildren,
      form.education.relatedToEducation,
      form.workExperience.currentlyWorking,
      form.connections.relativesOrFriends,
      form.connections.visited,
      form.connections.studied,
      form.connections.worked,
      form.connections.writtenJobOffer,
      form.security.familyMedicalCondition,
      form.security.criminalConviction
    ];

    if (requiredAnswers.some((answer) => !answer)) {
      return 'Please answer all required Yes / No questions.';
    }

    const languageScores = Object.values(form.languageSkills).flatMap(Object.values);
    if (languageScores.some((score) => !score)) {
      return 'Please choose speaking, listening, and writing levels for English and French.';
    }

    if (
      form.workExperience.currentlyWorking === 'Yes' &&
      (!form.workExperience.currentDesignation || !form.workExperience.currentJobStartDate)
    ) {
      return 'Add your current designation and its start date.';
    }

    if (
      form.workExperience.currentlyWorking === 'No' &&
      !form.workExperience.lastWorkExperience.trim()
    ) {
      return 'Please enter your last work experience.';
    }

    if (!challenge?.token || !captchaAnswer) {
      setCaptchaError('Load the verification question and enter your answer.');
      return 'Please complete the verification check.';
    }

    setCaptchaError('');
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    const validationMessage = validate();
    if (validationMessage) {
      setSubmitError(validationMessage);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/eligibility-assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          captcha: { answer: captchaAnswer, token: challenge.token }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Could not submit the eligibility assessment.');
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(error.message || 'Could not submit the form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 text-center sm:p-12">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Assessment submitted</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Thank you. Your eligibility assessment has been received for review.
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(createInitialForm());
            setCaptchaAnswer('');
            refreshChallenge();
            setSubmitted(false);
          }}
          className="mt-6 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-800"
        >
          Start another assessment
        </button>
      </div>
    );
  }

  const inputGrid = 'grid grid-cols-1 gap-4 sm:grid-cols-2';
  const yesNo = ['Yes', 'No'];
  const yesNoField = (label, section, field) => (
    <Field label={label} required>
      <SelectInput value={form[section][field]} onChange={(value) => update(section, field, value)} options={yesNo} required />
    </Field>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-8">
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
        <strong>Visa Eligibility Assessment</strong>
        <p className="mt-1 text-red-800">Fill in your details below — it takes about 5 minutes.</p>
        <p className="mt-2 text-xs text-red-700">Fields marked * are required.</p>
      </div>

      {submitError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <Section title="Personal Details">
        <div className={inputGrid}>
          <Field label="Full name" required>
            <TextInput value={form.personalDetails.fullName} onChange={(value) => update('personalDetails', 'fullName', value)} required />
          </Field>
          <Field label="Email address" required>
            <TextInput type="email" value={form.personalDetails.email} onChange={(value) => update('personalDetails', 'email', value)} required />
          </Field>
          <Field label="Phone number" required>
            <TextInput type="tel" value={form.personalDetails.phone} onChange={(value) => update('personalDetails', 'phone', value)} required />
          </Field>
          <Field label="Date of birth">
            <TextInput type="date" value={form.personalDetails.dateOfBirth} onChange={(value) => update('personalDetails', 'dateOfBirth', value)} />
          </Field>
          <Field label="Country of residence" required>
            <TextInput value={form.personalDetails.countryOfResidence} onChange={(value) => update('personalDetails', 'countryOfResidence', value)} required />
          </Field>
          <Field label="Nationality">
            <TextInput value={form.personalDetails.nationality} onChange={(value) => update('personalDetails', 'nationality', value)} />
          </Field>
        </div>
      </Section>

      <Section title="Family Details">
        <div className={inputGrid}>
          <Field label="Marital status" required>
            <SelectInput value={form.familyDetails.maritalStatus} onChange={(value) => update('familyDetails', 'maritalStatus', value)} options={['Single', 'Married', 'Common-law', 'Divorced', 'Widowed', 'Other']} required />
          </Field>
          {yesNoField('Do you have dependent children?', 'familyDetails', 'hasDependentChildren')}
          {form.familyDetails.hasDependentChildren === 'Yes' && (
            <>
              <Field label="Number of dependent children">
                <TextInput type="number" min="0" value={form.familyDetails.dependentChildrenCount} onChange={(value) => update('familyDetails', 'dependentChildrenCount', value)} />
              </Field>
              <Field label="Children's ages">
                <TextInput value={form.familyDetails.dependentChildrenAges} onChange={(value) => update('familyDetails', 'dependentChildrenAges', value)} placeholder="For example: 5, 8" />
              </Field>
            </>
          )}
        </div>
        <Field label="Other family details">
          <textarea
            rows={3}
            value={form.familyDetails.familyInformation}
            onChange={(event) => update('familyDetails', 'familyInformation', event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            placeholder="Optional details about your family"
          />
        </Field>
      </Section>

      <Section
        title="Personal Net-worth"
        description="Please give your net worth in US Dollar ($) and INR (Indian Rupees)."
      >
        <div className={inputGrid}>
          <Field label="Net worth (USD $)" required>
            <TextInput type="number" min="0" step="0.01" value={form.netWorth.usd} onChange={(value) => update('netWorth', 'usd', value)} required />
          </Field>
          <Field label="Net worth (INR ₹)" required>
            <TextInput type="number" min="0" step="0.01" value={form.netWorth.inr} onChange={(value) => update('netWorth', 'inr', value)} required />
          </Field>
        </div>
      </Section>

      <Section
        title="Your Education / Qualification"
        description="Enter formal academic qualifications awarded by a recognized university or post-secondary institution. Do not include occupational or trade qualifications. Use the qualification and institution names as shown on your documents."
      >
        <div className={inputGrid}>
          <Field label="Degree / diploma / certificate" required>
            <TextInput value={form.education.qualification} onChange={(value) => update('education', 'qualification', value)} required placeholder="For example: Bachelor of Science" />
          </Field>
          <Field label="University / institution" required>
            <TextInput value={form.education.institution} onChange={(value) => update('education', 'institution', value)} required />
          </Field>
          <Field label="Year completed">
            <TextInput type="number" min="1900" max={new Date().getFullYear()} value={form.education.graduationYear} onChange={(value) => update('education', 'graduationYear', value)} />
          </Field>
          {yesNoField('Did you work in a job related to this education?', 'education', 'relatedToEducation')}
        </div>
      </Section>

      <Section
        title="Your Work Experience"
        description="Please enter your last work experience. If you are currently working, include your current designation and start date."
      >
        <div className={inputGrid}>
          {yesNoField('Are you currently working?', 'workExperience', 'currentlyWorking')}
          {form.workExperience.currentlyWorking === 'Yes' ? (
            <>
              <Field label="Current designation / role" required>
                <TextInput value={form.workExperience.currentDesignation} onChange={(value) => update('workExperience', 'currentDesignation', value)} required />
              </Field>
              <Field label="Current role start date" required>
                <TextInput type="date" value={form.workExperience.currentJobStartDate} onChange={(value) => update('workExperience', 'currentJobStartDate', value)} required />
              </Field>
            </>
          ) : form.workExperience.currentlyWorking === 'No' ? (
            <Field label="Last work experience / role" required>
              <TextInput value={form.workExperience.lastWorkExperience} onChange={(value) => update('workExperience', 'lastWorkExperience', value)} required />
            </Field>
          ) : null}
        </div>
      </Section>

      <Section title="Language Skills" description="Choose your speaking, listening, and writing level for each language.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {['english', 'french'].map((language) => (
            <div key={language} className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-bold capitalize text-slate-800">{language} language command</h3>
              <div className="space-y-3">
                {['speaking', 'listening', 'writing'].map((skill) => (
                  <Field key={skill} label={skill} required>
                    <SelectInput
                      value={form.languageSkills[language][skill]}
                      onChange={(value) => updateSkill(language, skill, value)}
                      options={skillLevels}
                      required
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="About Connections" description="Answer for Canada, Australia, or Hong Kong.">
        <div className={inputGrid}>
          {[
            ['Do you have relatives or friends there?', 'relativesOrFriends'],
            ['Have you visited there?', 'visited'],
            ['Have you studied there?', 'studied'],
            ['Have you worked there?', 'worked'],
            ['Do you have a written job offer there?', 'writtenJobOffer']
          ].map(([label, field]) => (
            <Field key={field} label={label} required>
              <SelectInput value={form.connections[field]} onChange={(value) => update('connections', field, value)} options={yesNo} required />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Security">
        <div className={inputGrid}>
          {yesNoField('Do any of your immediate family members have a medical condition?', 'security', 'familyMedicalCondition')}
          {yesNoField('Have you ever been convicted of a criminal offense?', 'security', 'criminalConviction')}
          {form.security.familyMedicalCondition === 'Yes' && (
            <Field label="Please provide details">
              <TextInput value={form.security.medicalDetails} onChange={(value) => update('security', 'medicalDetails', value)} />
            </Field>
          )}
          {form.security.criminalConviction === 'Yes' && (
            <Field label="Please provide details">
              <TextInput value={form.security.convictionDetails} onChange={(value) => update('security', 'convictionDetails', value)} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Consultant">
        <Field label="Select consultant" required>
          <SelectInput value={form.consultant} onChange={(value) => setForm((current) => ({ ...current, consultant: value }))} options={consultants} required />
        </Field>
      </Section>

      <Section title="Verification" description="Please solve the check below to continue.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800" aria-live="polite">
            {captchaLoading ? 'Loading verification question…' : challenge ? `What is ${challenge.first} + ${challenge.second}?` : 'Verification question unavailable'}
          </div>
          <Field label="Your answer" required>
            <TextInput type="number" value={captchaAnswer} onChange={setCaptchaAnswer} required />
          </Field>
          <button
            type="button"
            onClick={refreshChallenge}
            disabled={captchaLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            aria-label="Refresh verification question"
          >
            <RefreshCw className={`h-4 w-4 ${captchaLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {captchaError && <p className="text-sm text-red-700">{captchaError}</p>}
      </Section>

      <div className="flex flex-col items-center gap-3 border-t border-slate-200 pt-5">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Your assessment will be sent for review.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-gradient-to-r from-red-700 to-red-600 px-8 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-md transition hover:from-red-800 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? 'Submitting…' : 'Submit assessment'}
        </button>
      </div>
    </form>
  );
}
