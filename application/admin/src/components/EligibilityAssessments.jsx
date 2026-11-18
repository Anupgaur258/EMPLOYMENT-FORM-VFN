import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, FileText, RefreshCw, Search, Trash2, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const STATUS_OPTIONS = ['Pending', 'In Review', 'Contacted', 'Qualified', 'Not Qualified', 'Closed'];

const readApiResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
};

const labelFor = (value) => value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());

function DetailGroup({ title, value }) {
  if (!value || typeof value !== 'object') return null;

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-red-700">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(value).map(([key, item]) => (
          item && typeof item === 'object' ? (
            <div key={key} className="sm:col-span-2">
              <DetailGroup title={labelFor(key)} value={item} />
            </div>
          ) : (
            <div key={key} className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase text-slate-400">{labelFor(key)}</span>
              <span className="block break-words text-sm text-slate-800">{item || '—'}</span>
            </div>
          )
        ))}
      </div>
    </section>
  );
}

export default function EligibilityAssessments({ token, onUnauthorized, reloadKey = 0 }) {
  const [assessments, setAssessments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('Pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAssessments = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/admin/eligibility-assessments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await readApiResponse(response);
      setAssessments(data.assessments || []);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) {
        onUnauthorized();
      }
      setError(requestError.message || 'Failed to load eligibility assessments.');
    } finally {
      setIsLoading(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments, reloadKey]);

  const filteredAssessments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assessments.filter((assessment) => {
      const matchesStatus = statusFilter === 'All' || assessment.status === statusFilter;
      const details = assessment.personalDetails || {};
      const matchesSearch =
        !query ||
        [details.fullName, details.email, details.phone, assessment.consultant]
          .some((value) => value?.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [assessments, search, statusFilter]);

  const openDetails = (assessment) => {
    setSelected(assessment);
    setStatus(assessment.status || 'Pending');
    setAdminNotes(assessment.adminNotes || '');
  };

  const saveAssessment = async () => {
    if (!selected) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/admin/eligibility-assessments/${selected._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, adminNotes })
      });
      const data = await readApiResponse(response);
      setSelected(data.assessment);
      setAssessments((current) => current.map((item) => item._id === data.assessment._id ? data.assessment : item));
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) onUnauthorized();
      setError(requestError.message || 'Failed to update assessment.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAssessment = async () => {
    if (!selected || !window.confirm(`Delete the eligibility assessment for ${selected.personalDetails?.fullName || 'this applicant'}?`)) {
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/admin/eligibility-assessments/${selected._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      await readApiResponse(response);
      setAssessments((current) => current.filter((item) => item._id !== selected._id));
      setSelected(null);
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) onUnauthorized();
      setError(requestError.message || 'Failed to delete assessment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, or consultant"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="All">All statuses</option>
            {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button
            type="button"
            onClick={loadAssessments}
            disabled={isLoading}
            aria-label="Refresh assessments"
            className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold text-slate-800">
            <FileText className="h-5 w-5 text-red-600" />
            Visa Eligibility Assessments
          </h2>
          <span className="text-xs text-slate-500">{filteredAssessments.length} submission(s)</span>
        </div>
        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading assessments…</div>
        ) : filteredAssessments.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">No eligibility assessments found</p>
            <p className="mt-1 text-xs text-slate-400">New form submissions will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAssessments.map((assessment) => (
              <div key={assessment._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{assessment.personalDetails?.fullName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {assessment.personalDetails?.email} · {assessment.personalDetails?.phone}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Submitted {assessment.createdAt ? new Date(assessment.createdAt).toLocaleString() : '—'} · {assessment.consultant}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{assessment.status}</span>
                  <button
                    type="button"
                    onClick={() => openDetails(assessment)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60">
          <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-900 p-5 text-white">
              <div>
                <h2 className="text-lg font-bold">{selected.personalDetails?.fullName}</h2>
                <p className="mt-1 text-xs text-slate-300">Visa Eligibility Assessment</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close details" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-slate-600">
                  Review status
                  <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800">
                    {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <div className="text-xs text-slate-500">
                  Submitted
                  <p className="mt-1 text-sm text-slate-800">
                    {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'}
                  </p>
                </div>
              </div>
              <DetailGroup title="Personal Details" value={selected.personalDetails} />
              <DetailGroup title="Family Details" value={selected.familyDetails} />
              <DetailGroup title="Personal Net-worth" value={selected.netWorth} />
              <DetailGroup title="Education / Qualification" value={selected.education} />
              <DetailGroup title="Work Experience" value={selected.workExperience} />
              <DetailGroup title="Language Skills" value={selected.languageSkills} />
              <DetailGroup title="About Connections" value={selected.connections} />
              <DetailGroup title="Security" value={selected.security} />
              <DetailGroup title="Consultant" value={{ consultant: selected.consultant }} />
              <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                Internal admin notes
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm font-normal text-slate-800 outline-none focus:border-red-500"
                  placeholder="Add follow-up or review notes"
                />
              </label>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={deleteAssessment} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Close
                </button>
                <button type="button" onClick={saveAssessment} disabled={isSaving} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
                  {isSaving ? 'Saving…' : 'Save review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
