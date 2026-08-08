import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Upload, Download, FileText, CheckCircle2, AlertCircle, Loader2, Monitor, ChevronDown, ChevronUp, Database, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { isNativePlatform } from '../lib/capacitorSetup';

interface BulkUploadJob {
  id: string;
  filename: string;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  duplicate_count: number;
  status: 'pending' | 'validating' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

interface BulkUploadError {
  id: string;
  row_number: number;
  error_type: string;
  error_message: string;
  row_data: Record<string, unknown>;
}

interface ComicRow {
  series: string;
  story?: string;
  issue_number?: string;
  publisher?: string;
  year?: string | number;
  condition?: string;
  notes?: string;
  copy_count?: string | number;
  cover_variant?: string | number;
  total_issues?: string | number;
  purchase_price?: string | number;
  purchase_date?: string;
}

export function BulkUpload() {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<BulkUploadJob[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Record<string, BulkUploadError[] | null>>({});
  const [loadingErrors, setLoadingErrors] = useState<Record<string, boolean>>({});
  const [exportingCollection, setExportingCollection] = useState(false);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<string | null>(null);

  useEffect(() => {
    checkPermission();
    loadJobs();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('bulk_upload_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bulk_upload_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const checkPermission = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('can_bulk_upload')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      setHasPermission(data.can_bulk_upload);
    }
  };

  const loadJobs = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('bulk_upload_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setJobs(data);
    }
  };

  const deleteJob = async (jobId: string) => {
    setDeletingJob(jobId);
    try {
      await supabase.from('bulk_upload_errors').delete().eq('job_id', jobId);
      const { error } = await supabase.from('bulk_upload_jobs').delete().eq('id', jobId);
      if (error) throw error;
      setJobs(prev => prev.filter(j => j.id !== jobId));
      setExpandedErrors(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete job:', err);
    } finally {
      setDeletingJob(null);
      setConfirmDeleteJob(null);
    }
  };

  const toggleErrors = async (jobId: string) => {
    if (expandedErrors[jobId] !== undefined) {
      setExpandedErrors(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      return;
    }

    setLoadingErrors(prev => ({ ...prev, [jobId]: true }));

    const { data, error } = await supabase
      .from('bulk_upload_errors')
      .select('id, row_number, error_type, error_message, row_data')
      .eq('job_id', jobId)
      .order('row_number', { ascending: true });

    setLoadingErrors(prev => ({ ...prev, [jobId]: false }));

    if (!error) {
      setExpandedErrors(prev => ({ ...prev, [jobId]: data ?? [] }));
    }
  };

  const exportCollection = async () => {
    if (!user) return;
    setExportingCollection(true);

    try {
      const { data, error } = await supabase
        .from('comics')
        .select('series, story, issue_number, publisher, year, condition, notes, copy_count, cover_variant, total_issues, purchase_price, purchase_date')
        .eq('user_id', user.id)
        .order('series', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) {
        alert('Your collection is empty — nothing to export.');
        return;
      }

      const rows = data.map(c => ({
        'Series': c.series ?? '',
        'Story': c.story ?? '',
        'Issue Number': c.issue_number ?? '',
        'Publisher': c.publisher ?? '',
        'Year': c.year ?? '',
        'Condition': c.condition ?? '',
        'Notes': c.notes ?? '',
        'Copy Count': c.copy_count ?? 1,
        'Cover Variant': c.cover_variant ?? '',
        'Total Issues in Arc': c.total_issues ?? '',
        'Purchase Price': c.purchase_price ?? '',
        'Purchase Date': c.purchase_date ?? '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Collection');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `my_collection_${today}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export collection. Please try again.');
    } finally {
      setExportingCollection(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        Series: 'The Amazing Spider-Man',
        Story: "Kraven's Last Hunt",
        'Issue Number': '294',
        Publisher: 'Marvel',
        Year: '1988',
        Condition: 'Near Mint',
        Notes: 'Part 1 of 6',
        'Copy Count': 1,
        'Cover Variant': '',
        'Total Issues in Arc': 6,
        'Purchase Price': '12.50',
        'Purchase Date': '2024-03-15',
      },
      {
        Series: 'Batman',
        Story: '',
        'Issue Number': '1',
        Publisher: 'DC Comics',
        Year: '1940',
        Condition: 'Good',
        Notes: 'Classic issue',
        'Copy Count': 2,
        'Cover Variant': 2,
        'Total Issues in Arc': '',
        'Purchase Price': '',
        'Purchase Date': '',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comics');
    XLSX.writeFile(workbook, 'comic_collection_template.xlsx');
  };

  const handleFileSelect = (file: File) => {
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(csv|xlsx|xls)$/i)) {
      alert('Please select a valid CSV or Excel file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit');
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const normalizeColumnName = (name: string): string => {
    const normalized = name.toLowerCase().trim();

    if (['series', 'comic series', 'title', 'comic title'].includes(normalized)) return 'series';
    if (['story', 'story title', 'arc', 'arc title', 'subtitle'].includes(normalized)) return 'story';
    if (['issue', 'issue number', 'issue #', 'issuenumber', 'issue_number'].includes(normalized)) return 'issue_number';
    if (['publisher'].includes(normalized)) return 'publisher';
    if (['year', 'publication year'].includes(normalized)) return 'year';
    if (['condition', 'grade'].includes(normalized)) return 'condition';
    if (['notes', 'comments', 'description'].includes(normalized)) return 'notes';
    if (['copy count', 'copy_count', 'copies', 'quantity'].includes(normalized)) return 'copy_count';
    if (['cover variant', 'cover_variant', 'variant', 'variant number', 'variant #'].includes(normalized)) return 'cover_variant';
    if (['total issues in arc', 'total issues', 'total_issues', 'issues in arc', 'arc length'].includes(normalized)) return 'total_issues';
    if (['purchase price', 'purchase_price', 'price', 'paid', 'price paid'].includes(normalized)) return 'purchase_price';
    if (['purchase date', 'purchase_date', 'date purchased', 'bought date', 'date bought'].includes(normalized)) return 'purchase_date';

    return normalized;
  };

  const parseFile = async (file: File): Promise<ComicRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

          const normalizedData = jsonData.map((row: any) => {
            const normalizedRow: any = {};
            Object.keys(row).forEach(key => {
              const normalizedKey = normalizeColumnName(key);
              normalizedRow[normalizedKey] = row[key];
            });

            return {
              series: normalizedRow.series || '',
              story: normalizedRow.story || '',
              issue_number: normalizedRow.issue_number || '',
              publisher: normalizedRow.publisher || '',
              year: normalizedRow.year || '',
              condition: normalizedRow.condition || '',
              notes: normalizedRow.notes || '',
              copy_count: normalizedRow.copy_count || '',
              cover_variant: normalizedRow.cover_variant || '',
              total_issues: normalizedRow.total_issues || '',
              purchase_price: normalizedRow.purchase_price || '',
              purchase_date: normalizedRow.purchase_date ? String(normalizedRow.purchase_date) : '',
            };
          });

          resolve(normalizedData);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    setUploading(true);

    try {
      const rows = await parseFile(selectedFile);

      if (rows.length === 0) {
        alert('No valid data found in file');
        setUploading(false);
        return;
      }

      if (rows.length > 1000) {
        alert('Maximum 1000 rows allowed per upload');
        setUploading(false);
        return;
      }

      const { data: job, error: jobError } = await supabase
        .from('bulk_upload_jobs')
        .insert({
          user_id: user.id,
          filename: selectedFile.name,
          total_rows: rows.length,
          status: 'pending',
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error('Failed to create upload job');
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        await supabase
          .from('bulk_upload_jobs')
          .update({ status: 'failed' })
          .eq('id', job.id);
        throw new Error('Authentication failed. Please log in again.');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bulk-upload`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          job_id: job.id,
          rows,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || 'Failed to process upload';

        await supabase
          .from('bulk_upload_jobs')
          .update({
            status: 'failed',
            validation_errors: errorData
          })
          .eq('id', job.id);

        throw new Error(errorMessage);
      }

      setSelectedFile(null);
      loadJobs();
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file. Please try again.';
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  if (hasPermission === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <AlertCircle size={64} className="text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Permission Required</h2>
          <p className="text-gray-400 mb-6">
            You need bulk upload permission to access this feature. Please contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  if (isNativePlatform()) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <Monitor size={64} className="text-blue-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Desktop Only</h2>
          <p className="text-gray-400">
            Bulk upload requires a spreadsheet file and is only available on desktop. Please open the app on a computer to use this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Bulk Upload</h1>
        <p className="text-gray-400">Upload multiple comics at once using a spreadsheet</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText size={24} />
            Upload File
          </h2>

          <div className="flex gap-3 mb-4">
            <button
              onClick={downloadTemplate}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download size={20} />
              Download Template
            </button>
            <button
              onClick={exportCollection}
              disabled={exportingCollection}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingCollection ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Database size={20} />
                  Export Collection
                </>
              )}
            </button>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-950' : 'border-gray-700'
            }`}
          >
            <Upload size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400 mb-4">
              Drag and drop your file here, or click to browse
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors"
            >
              Select File
            </label>
            <p className="text-sm text-gray-500 mt-4">
              CSV or Excel files only, max 5MB, up to 1000 rows
            </p>
          </div>

          {selectedFile && (
            <div className="mt-4 p-4 bg-gray-800 rounded-lg">
              <p className="font-semibold mb-1">{selectedFile.name}</p>
              <p className="text-sm text-gray-400">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    Start Upload
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <ol className="space-y-3 text-gray-300">
            <li className="flex gap-2">
              <span className="font-bold text-blue-500">1.</span>
              <span>Download the template file to see the required format</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-500">2.</span>
              <span>Fill in your comic data (Series is required, all other fields optional)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-500">3.</span>
              <span>Upload your completed file (CSV or Excel format)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-500">4.</span>
              <span>Duplicates will automatically increment the copy count</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-500">5.</span>
              <span>All uploads receive a placeholder image until you scan individual covers</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-500">6.</span>
              <span>Use "Export Collection" to download your existing collection in the same format</span>
            </li>
          </ol>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">Upload History</h2>
        {jobs.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No uploads yet. Start by uploading your first file!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                {confirmDeleteJob === job.id && (
                  <div className="mb-4 bg-red-950 border border-red-800 rounded-lg p-4 flex items-center justify-between gap-4">
                    <p className="text-sm text-red-200">Delete this upload record? This cannot be undone.</p>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => deleteJob(job.id)}
                        disabled={deletingJob === job.id}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {deletingJob === job.id ? <Loader2 size={14} className="animate-spin" /> : null}
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteJob(null)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{job.filename}</h3>
                    <p className="text-sm text-gray-400">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmDeleteJob(confirmDeleteJob === job.id ? null : job.id)}
                      disabled={deletingJob === job.id || job.status === 'processing'}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-950 rounded-lg transition-colors disabled:opacity-30"
                      title="Delete record"
                    >
                      <Trash2 size={16} />
                    </button>
                    {job.status === 'completed' && (
                      <span className="px-3 py-1 bg-green-900 text-green-300 rounded-full text-sm flex items-center gap-1">
                        <CheckCircle2 size={16} />
                        Completed
                      </span>
                    )}
                    {job.status === 'processing' && (
                      <span className="px-3 py-1 bg-blue-900 text-blue-300 rounded-full text-sm flex items-center gap-1">
                        <Loader2 size={16} className="animate-spin" />
                        Processing
                      </span>
                    )}
                    {job.status === 'failed' && (
                      <span className="px-3 py-1 bg-red-900 text-red-300 rounded-full text-sm flex items-center gap-1">
                        <AlertCircle size={16} />
                        Failed
                      </span>
                    )}
                    {job.status === 'pending' && (
                      <span className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm">
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {job.status === 'processing' && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{job.processed_rows} / {job.total_rows}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${(job.processed_rows / job.total_rows) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-blue-400">{job.total_rows}</p>
                    <p className="text-sm text-gray-400">Total Rows</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-400">{job.successful_rows}</p>
                    <p className="text-sm text-gray-400">Added</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-yellow-400">{job.duplicate_count}</p>
                    <p className="text-sm text-gray-400">Duplicates</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-400">{job.failed_rows}</p>
                    <p className="text-sm text-gray-400">Errors</p>
                  </div>
                </div>

                {job.failed_rows > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => toggleErrors(job.id)}
                      disabled={loadingErrors[job.id]}
                      className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                    >
                      {loadingErrors[job.id] ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : expandedErrors[job.id] !== undefined ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                      {expandedErrors[job.id] !== undefined ? 'Hide' : 'View'} {job.failed_rows} error{job.failed_rows !== 1 ? 's' : ''}
                    </button>

                    {expandedErrors[job.id] && (
                      <div className="mt-3 border border-red-900 rounded-lg overflow-hidden">
                        <div className="bg-red-950 px-4 py-2 text-xs font-semibold text-red-300 uppercase tracking-wider">
                          Row-level errors
                        </div>
                        <div className="divide-y divide-gray-800 max-h-80 overflow-y-auto">
                          {expandedErrors[job.id]!.map((err) => (
                            <div key={err.id} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-4 mb-1">
                                <span className="text-xs font-mono text-gray-500 whitespace-nowrap">Row {err.row_number}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  err.error_type === 'validation'
                                    ? 'bg-yellow-900 text-yellow-300'
                                    : 'bg-red-900 text-red-300'
                                }`}>
                                  {err.error_type}
                                </span>
                              </div>
                              <p className="text-sm text-gray-200 mb-1">{err.error_message}</p>
                              {(err.row_data?.series || err.row_data?.issue_number) && (
                                <p className="text-xs text-gray-500">
                                  {[
                                    err.row_data.series,
                                    err.row_data.story,
                                    err.row_data.issue_number ? `#${err.row_data.issue_number}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' — ')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
