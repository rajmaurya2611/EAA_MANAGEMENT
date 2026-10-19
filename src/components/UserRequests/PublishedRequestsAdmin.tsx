import React, { useEffect, useMemo, useState } from 'react';
import {
    Table,
    Spin,
    message,
    Tag,
    Select,
    Modal,
    Button,
    Input,
    Tabs,
    Switch,
    InputNumber,
    Space,
    Popconfirm,
    Dropdown,
    ConfigProvider,
    theme as antdTheme,
    AutoComplete,
} from 'antd';

import { MoreOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';

import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';

import { db } from '../../firebaseConfig';

import {
    ref as dbRef,
    onValue,
    update,
    push,
    get,
} from 'firebase/database';

import CryptoJS from 'crypto-js';

const { Option } = Select;
const { TabPane } = Tabs;

// ============================================================
// AES KEYS
// ============================================================

const REQUESTS_AES_SECRET_KEY =
    import.meta.env.VITE_MATERIALS_AES_SECRET_KEY as string;

const USER_AES_SECRET_KEY =
    import.meta.env.VITE_AES_SECRET_KEY as string;


// ============================================================
// AES HELPERS
// ============================================================

function decryptAES(ciphertext: string, key: string): string {
    try {
        const normalized = (ciphertext || '').replace(/\s+/g, '');

        const parsedKey = CryptoJS.enc.Utf8.parse(key);

        const dec = CryptoJS.AES.decrypt(normalized, parsedKey, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7,
        });

        return dec.toString(CryptoJS.enc.Utf8);
    } catch (err) {
        console.error('AES decrypt error:', err);
        return ciphertext;
    }
}

function encryptAES(plain: string, key: string): string {
    try {
        const parsedKey = CryptoJS.enc.Utf8.parse(key);

        return CryptoJS.AES.encrypt(plain, parsedKey, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7,
        }).toString();
    } catch (err) {
        console.error('AES encrypt error:', err);
        return plain;
    }
}


// ============================================================
// FIREBASE PATHS
// ============================================================

const PUBLISHED_REQUESTS_ROOT = 'version12/PublishedRequests';

const MATERIALS_ROOT = 'version12/Materials';

const USERS_ROOT = 'version12/users';


const MATERIALS_V2_ROOT = 'MaterialsV2';
const MATERIALS_V2_ITEMS_ROOT = `${MATERIALS_V2_ROOT}/items`;
const MATERIALS_V2_ACTIVE_INDEX_ROOT = `${MATERIALS_V2_ROOT}/activeIndex`;


// ============================================================
// SECTIONS
// (Same node level in Firebase, for both PublishedRequests
//  and Materials. Add more here later — no other code
//  changes needed as long as the category name matches
//  exactly in both nodes.)
// ============================================================

const SECTION_KEYS = [
    'E-Book',
    'Notes',
    'Pyqs',
    'Lectures',
    'Quantum',
    'Roadmaps',
    'Syllabus',
];

const SECTION_LABELS = [
    'E-Books',
    'Notes',
    'PYQs',
    'Lectures',
    'Quantum',
    'Roadmaps',
    'Syllabus',
];


// ============================================================
// YEAR / BRANCH OPTIONS (for Add to Materials form)
// ============================================================

const YEAR_OPTIONS = [
    'First_Year',
    'Second_Year',
    'Third_Year',
    'Fourth_Year',
];

/*
 * Curated list. Historical data has inconsistent casing/
 * naming ("All Branch", "All_Branch", "CSE-AIML", "CSE AIML"
 * etc). This list keeps new entries consistent, but the
 * field is an AutoComplete so admins can still type a custom
 * value if genuinely needed.
 */
const BRANCH_OPTIONS = [
    'ALL',
    'CSE',
    'CSE-AIML',
    'CSE IOT',
    'IT',
    'ECE',
    'EEE',
    'ME',
    'CIVIL',
    'DS',
    'HSMC',
    'Common Subjects',
    'Common Non-Credit',
    'Open Elective',
];


// ============================================================
// MODELS
// ============================================================

interface Contribution {
    id: string;
    userId: string;
    fileName: string;
    message: string;
    status: string; // PENDING | APPROVED | REJECTED
    storagePath: string;
    downloadUrl: string;
    submittedAt: string;
    materialId?: string;
}

interface PublishedRequestRecord {
    id: string;
    section: string;

    title: string;
    description: string;
    category: string;
    status: string; // OPEN | UNDER_REVIEW | FULFILLED | CLOSED
    publishedDate: string;

    originalRequestId: string;

    requesterCount: number;
    contributionCount: number;

    active: boolean;

    createdAt?: number;

    contributions: Contribution[];
}


interface RequestForm {
    title: string;
    description: string;
    category: string;
    status: string;
    publishedDate: string;
    originalRequestId: string;
    requesterCount: number;
}


const EMPTY_FORM: RequestForm = {
    title: '',
    description: '',
    category: 'E-Book',
    status: 'OPEN',
    publishedDate: '',
    originalRequestId: '',
    requesterCount: 1,
};


interface ApproveForm {
    year: string;
    branch: string;
    subName: string;
    subCode: string;
}

const EMPTY_APPROVE_FORM: ApproveForm = {
    year: YEAR_OPTIONS[0],
    branch: BRANCH_OPTIONS[0],
    subName: '',
    subCode: '',
};


// ============================================================
// DATE HELPERS
// ============================================================

function getCurrentDateDashed(): string {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    return `${day}-${month}-${year}`;
}

/*
 * Materials node stores dates as M/D/YYYY (no leading
 * zeros) e.g. "7/14/2025" — matching existing records.
 */
function getCurrentDateSlash(): string {
    const now = new Date();

    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    return `${month}/${day}/${year}`;
}


// ============================================================
// STATUS COLOR
// ============================================================

function getStatusColor(status: string) {
    switch (status) {
        case 'OPEN':
            return 'green';
        case 'UNDER_REVIEW':
            return 'gold';
        case 'FULFILLED':
            return 'blue';
        case 'CLOSED':
            return 'default';
        default:
            return 'default';
    }
}

function getContributionStatusColor(status: string) {
    switch (status) {
        case 'APPROVED':
            return 'green';
        case 'REJECTED':
            return 'red';
        case 'PENDING':
        default:
            return 'gold';
    }
}


// ============================================================
// COMPONENT
// ============================================================

const PublishedRequestsAdmin: React.FC = () => {

    // ==========================================================
    // THEME (dark mode default)
    // ==========================================================

    const [darkMode, setDarkMode] = useState<boolean>(true);


    // ==========================================================
    // SECTION (TAB)
    // ==========================================================

    const [activeSection, setActiveSection] = useState<string>(
        SECTION_KEYS[0]
    );


    // ==========================================================
    // DATA
    // ==========================================================

    const [allData, setAllData] = useState<PublishedRequestRecord[]>([]);

    const [loading, setLoading] = useState(true);

    const [showInactive, setShowInactive] = useState(false);


    // ==========================================================
    // VIEW MODAL
    // ==========================================================

    const [selectedItem, setSelectedItem] =
        useState<PublishedRequestRecord | null>(null);

    const [viewModalVisible, setViewModalVisible] = useState(false);


    // ==========================================================
    // CONTRIBUTIONS MODAL
    // ==========================================================

    const [contributionsItem, setContributionsItem] =
        useState<PublishedRequestRecord | null>(null);

    const [contributionsModalVisible, setContributionsModalVisible] =
        useState(false);

    /*
     * Keep contributionsItem in sync whenever allData refreshes
     * (e.g. after an approve/reject write comes back through
     * the live listener), so the open modal doesn't show stale
     * contribution statuses.
     */
    useEffect(() => {

        if (!contributionsItem) return;

        const fresh = allData.find(r => r.id === contributionsItem.id);

        if (fresh) {
            setContributionsItem(fresh);
        }

    }, [allData]);


    // ==========================================================
    // CREATE / EDIT MODAL
    // ==========================================================

    const [formModalVisible, setFormModalVisible] = useState(false);

    const [formMode, setFormMode] = useState<'create' | 'edit'>('create');

    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState<RequestForm>(EMPTY_FORM);

    const [saving, setSaving] = useState(false);


    // ==========================================================
    // APPROVE (ADD TO MATERIALS) MODAL
    // ==========================================================

    const [approveModalVisible, setApproveModalVisible] = useState(false);

    const [approveRequest, setApproveRequest] =
        useState<PublishedRequestRecord | null>(null);

    const [approveContribution, setApproveContribution] =
        useState<Contribution | null>(null);

    const [approveForm, setApproveForm] =
        useState<ApproveForm>(EMPTY_APPROVE_FORM);

    const [contributorName, setContributorName] = useState<string>('');

    const [contributorLoading, setContributorLoading] = useState(false);

    const [approving, setApproving] = useState(false);


    // ==========================================================
    // 1. LOAD PUBLISHED REQUESTS FOR SELECTED SECTION
    // ==========================================================

    useEffect(() => {

        setLoading(true);

        const sectionRef = dbRef(
            db,
            `${PUBLISHED_REQUESTS_ROOT}/${activeSection}`
        );

        const unsub = onValue(
            sectionRef,
            snap => {

                const raw = snap.val() || {};

                const parsed: PublishedRequestRecord[] = Object.entries(raw).map(
                    ([id, entry]: [string, any]) => {

                        const contributionsRaw = entry.contributions || {};

                        const contributions: Contribution[] = Object.entries(
                            contributionsRaw
                        ).map(([cid, c]: [string, any]) => ({
                            id: cid,
                            userId: c.userId || '',
                            fileName: c.fileName || '',
                            message: c.message || '',
                            status: c.status || 'PENDING',
                            storagePath: c.storagePath || '',
                            downloadUrl: c.downloadUrl || '',
                            submittedAt: c.submittedAt || '',
                            materialId: c.materialId || undefined,
                        }));

                        return {
                            id,
                            section: activeSection,

                            title: decryptAES(
                                entry.title || '',
                                REQUESTS_AES_SECRET_KEY
                            ),

                            description: decryptAES(
                                entry.description || '',
                                REQUESTS_AES_SECRET_KEY
                            ),

                            category: decryptAES(
                                entry.category || '',
                                REQUESTS_AES_SECRET_KEY
                            ),

                            status: decryptAES(
                                entry.status || '',
                                REQUESTS_AES_SECRET_KEY
                            ).toUpperCase(),

                            publishedDate: decryptAES(
                                entry.publishedDate || '',
                                REQUESTS_AES_SECRET_KEY
                            ),

                            originalRequestId: entry.originalRequestId || '',

                            requesterCount:
                                typeof entry.requesterCount === 'number'
                                    ? entry.requesterCount
                                    : 0,

                            contributionCount:
                                typeof entry.contributionCount === 'number'
                                    ? entry.contributionCount
                                    : 0,

                            /*
                             * Older records won't have "active" yet.
                             * Treat missing as active (true) so nothing
                             * already-published silently disappears.
                             */
                            active: entry.active === false ? false : true,

                            createdAt: entry.createdAt || 0,

                            contributions,
                        };
                    }
                );

                setAllData(parsed);
                setLoading(false);
            },
            err => {
                console.error('Fetch PublishedRequests error:', err);
                message.error('Failed to load published requests.');
                setLoading(false);
            }
        );

        return () => unsub();

    }, [activeSection]);


    // ==========================================================
    // FILTERED VIEW (active/inactive toggle + newest first)
    // ==========================================================

    const filteredData = useMemo(() => {

        const base = showInactive
            ? allData
            : allData.filter(r => r.active);

        return [...base].sort(
            (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );

    }, [allData, showInactive]);


    // ==========================================================
    // OPEN CREATE MODAL
    // ==========================================================

    const openCreateModal = () => {

        setFormMode('create');
        setEditingId(null);

        setForm({
            ...EMPTY_FORM,
            category: activeSection,
            publishedDate: getCurrentDateDashed(),
        });

        setFormModalVisible(true);
    };


    // ==========================================================
    // OPEN EDIT MODAL
    // ==========================================================

    const openEditModal = (item: PublishedRequestRecord) => {

        setFormMode('edit');
        setEditingId(item.id);

        setForm({
            title: item.title,
            description: item.description,
            category: item.category,
            status: item.status,
            publishedDate: item.publishedDate,
            originalRequestId: item.originalRequestId,
            requesterCount: item.requesterCount,
        });

        setFormModalVisible(true);
    };


    // ==========================================================
    // CLOSE FORM MODAL
    // ==========================================================

    const closeFormModal = () => {

        if (saving) return;

        setFormModalVisible(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
    };


    // ==========================================================
    // SAVE (CREATE OR UPDATE)
    // ==========================================================

    const handleSaveForm = async () => {

        if (!form.title.trim()) {
            message.error('Please enter a title.');
            return;
        }

        if (!form.description.trim()) {
            message.error('Please enter a description.');
            return;
        }

        if (!form.category.trim()) {
            message.error('Please select a category.');
            return;
        }

        if (!form.status.trim()) {
            message.error('Please select a status.');
            return;
        }

        if (!form.publishedDate.trim()) {
            message.error('Please enter a published date.');
            return;
        }

        try {

            setSaving(true);

            if (formMode === 'create') {

                const sectionRef = dbRef(
                    db,
                    `${PUBLISHED_REQUESTS_ROOT}/${activeSection}`
                );

                const newRef = push(sectionRef);

                const newId = newRef.key;

                if (!newId) {
                    throw new Error('Unable to generate request ID.');
                }

                const newData = {
                    title: encryptAES(form.title.trim(), REQUESTS_AES_SECRET_KEY),
                    description: encryptAES(
                        form.description.trim(),
                        REQUESTS_AES_SECRET_KEY
                    ),
                    category: encryptAES(
                        form.category.trim(),
                        REQUESTS_AES_SECRET_KEY
                    ),
                    status: encryptAES(form.status.trim(), REQUESTS_AES_SECRET_KEY),
                    publishedDate: encryptAES(
                        form.publishedDate.trim(),
                        REQUESTS_AES_SECRET_KEY
                    ),
                    originalRequestId: form.originalRequestId.trim(),
                    requesterCount: form.requesterCount || 0,
                    contributionCount: 0,
                    active: true,
                    createdAt: Date.now(),
                };

                const updates: Record<string, any> = {};

                updates[
                    `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${newId}`
                ] = newData;

                await update(dbRef(db), updates);

                message.success('Published request created.');

            } else {

                if (!editingId) {
                    throw new Error('Missing request ID for update.');
                }

                const updates: Record<string, any> = {};

                const basePath = `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${editingId}`;

                updates[`${basePath}/title`] = encryptAES(
                    form.title.trim(),
                    REQUESTS_AES_SECRET_KEY
                );

                updates[`${basePath}/description`] = encryptAES(
                    form.description.trim(),
                    REQUESTS_AES_SECRET_KEY
                );

                updates[`${basePath}/category`] = encryptAES(
                    form.category.trim(),
                    REQUESTS_AES_SECRET_KEY
                );

                updates[`${basePath}/status`] = encryptAES(
                    form.status.trim(),
                    REQUESTS_AES_SECRET_KEY
                );

                updates[`${basePath}/publishedDate`] = encryptAES(
                    form.publishedDate.trim(),
                    REQUESTS_AES_SECRET_KEY
                );

                updates[`${basePath}/originalRequestId`] =
                    form.originalRequestId.trim();

                updates[`${basePath}/requesterCount`] = form.requesterCount || 0;

                await update(dbRef(db), updates);

                message.success('Published request updated.');
            }

            closeFormModal();

        } catch (err) {

            console.error('Save failed:', err);
            message.error('Failed to save published request. Please try again.');

        } finally {

            setSaving(false);
        }
    };


    // ==========================================================
    // QUICK STATUS CHANGE (from view modal)
    // ==========================================================

    const handleStatusChange = async (id: string, newStatus: string) => {

        try {

            await update(
                dbRef(
                    db,
                    `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${id}`
                ),
                {
                    status: encryptAES(newStatus, REQUESTS_AES_SECRET_KEY),
                }
            );

            setAllData(ds =>
                ds.map(r =>
                    r.id === id ? { ...r, status: newStatus } : r
                )
            );

            if (selectedItem?.id === id) {
                setSelectedItem({ ...selectedItem, status: newStatus });
            }

            message.success(`Status updated to "${newStatus}"`);

        } catch (err) {

            console.error('Status update failed:', err);
            message.error('Failed to update status');
        }
    };


    // ==========================================================
    // SOFT DELETE / RESTORE (active flag toggle)
    // ==========================================================

    const handleToggleActive = async (
        item: PublishedRequestRecord,
        nextActive: boolean
    ) => {

        try {

            await update(
                dbRef(
                    db,
                    `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${item.id}`
                ),
                {
                    active: nextActive,
                }
            );

            setAllData(ds =>
                ds.map(r =>
                    r.id === item.id ? { ...r, active: nextActive } : r
                )
            );

            if (selectedItem?.id === item.id) {
                setSelectedItem({ ...selectedItem, active: nextActive });
            }

            message.success(
                nextActive
                    ? 'Request restored.'
                    : 'Request deactivated (soft deleted).'
            );

        } catch (err) {

            console.error('Toggle active failed:', err);
            message.error('Failed to update request status.');
        }
    };


    // ==========================================================
    // REJECT CONTRIBUTION
    // ==========================================================

    const handleRejectContribution = async (
        request: PublishedRequestRecord,
        contributionId: string
    ) => {

        try {

            await update(
                dbRef(
                    db,
                    `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${request.id}/contributions/${contributionId}`
                ),
                {
                    status: 'REJECTED',
                }
            );

            setAllData(ds =>
                ds.map(r => {

                    if (r.id !== request.id) return r;

                    return {
                        ...r,
                        contributions: r.contributions.map(c =>
                            c.id === contributionId
                                ? { ...c, status: 'REJECTED' }
                                : c
                        ),
                    };
                })
            );

            message.success('Contribution rejected.');

        } catch (err) {

            console.error('Reject failed:', err);
            message.error('Failed to reject contribution.');
        }
    };


    // ==========================================================
    // OPEN APPROVE MODAL (fetches contributor name, prefills form)
    // ==========================================================

    const openApproveModal = async (
        request: PublishedRequestRecord,
        contribution: Contribution
    ) => {

        setApproveRequest(request);
        setApproveContribution(contribution);

        setApproveForm({
            year: YEAR_OPTIONS[0],
            branch: BRANCH_OPTIONS[0],
            subName: request.title,
            subCode: '',
        });

        setContributorName('');
        setContributorLoading(true);

        setApproveModalVisible(true);

        try {

            const snap = await get(
                dbRef(db, `${USERS_ROOT}/${contribution.userId}/name`)
            );

            const rawName = snap.exists() ? snap.val() : '';

            const decrypted = decryptAES(
                rawName || '',
                USER_AES_SECRET_KEY
            ).trim();

            setContributorName(decrypted || 'Unknown Contributor');

        } catch (err) {

            console.error('Fetch contributor name failed:', err);
            setContributorName('Unknown Contributor');

        } finally {

            setContributorLoading(false);
        }
    };


    // ==========================================================
    // CLOSE APPROVE MODAL
    // ==========================================================

    const closeApproveModal = () => {

        if (approving) return;

        setApproveModalVisible(false);
        setApproveRequest(null);
        setApproveContribution(null);
        setApproveForm(EMPTY_APPROVE_FORM);
        setContributorName('');
    };


    // ==========================================================
    // APPROVE FORM VALIDITY
    // ==========================================================

    const isApproveFormValid =
        !contributorLoading &&
        contributorName.trim().length > 0 &&
        approveForm.year.trim().length > 0 &&
        approveForm.branch.trim().length > 0 &&
        approveForm.subName.trim().length > 0 &&
        approveForm.subCode.trim().length > 0;


    // ==========================================================
    // SUBMIT APPROVE (writes to Materials + marks contribution
    // APPROVED, in one atomic update)
    // ==========================================================

    // const handleConfirmApprove = async () => {

    //     if (!approveRequest || !approveContribution) return;

    //     if (!isApproveFormValid) {
    //         message.error('Please fill in all required fields.');
    //         return;
    //     }

    //     try {

    //         setApproving(true);

    //         const materialsSectionRef = dbRef(
    //             db,
    //             `${MATERIALS_ROOT}/${activeSection}/${approveForm.year}/${approveForm.branch}`
    //         );

    //         const newMaterialRef = push(materialsSectionRef);

    //         const newMaterialId = newMaterialRef.key;

    //         if (!newMaterialId) {
    //             throw new Error('Unable to generate material ID.');
    //         }

    //         const materialData = {
    //             by: encryptAES(contributorName.trim(), REQUESTS_AES_SECRET_KEY),
    //             date: getCurrentDateSlash(),
    //             dislikes: 0,
    //             id: newMaterialId,
    //             likes: 0,
    //             pdf: encryptAES(
    //                 approveContribution.downloadUrl,
    //                 REQUESTS_AES_SECRET_KEY
    //             ),
    //             sub_code: encryptAES(
    //                 approveForm.subCode.trim(),
    //                 REQUESTS_AES_SECRET_KEY
    //             ),
    //             sub_name: encryptAES(
    //                 approveForm.subName.trim(),
    //                 REQUESTS_AES_SECRET_KEY
    //             ),
    //         };

    //         const updates: Record<string, any> = {};

    //         // 1. Add new item to the main Materials node
    //         updates[
    //             `${MATERIALS_ROOT}/${activeSection}/${approveForm.year}/${approveForm.branch}/${newMaterialId}`
    //         ] = materialData;

    //         // 2. Mark the contribution as approved
    //         updates[
    //             `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${approveRequest.id}/contributions/${approveContribution.id}/status`
    //         ] = 'APPROVED';

    //         // 3. Link back to the new material for traceability
    //         updates[
    //             `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${approveRequest.id}/contributions/${approveContribution.id}/materialId`
    //         ] = newMaterialId;

    //         await update(dbRef(db), updates);

    //         // ------------------------------------------------------
    //         // UPDATE LOCAL STATE
    //         // ------------------------------------------------------

    //         setAllData(ds =>
    //             ds.map(r => {

    //                 if (r.id !== approveRequest.id) return r;

    //                 return {
    //                     ...r,
    //                     contributions: r.contributions.map(c =>
    //                         c.id === approveContribution.id
    //                             ? { ...c, status: 'APPROVED', materialId: newMaterialId }
    //                             : c
    //                     ),
    //                 };
    //             })
    //         );

    //         message.success('Contribution approved and added to Materials.');

    //         closeApproveModal();

    //     } catch (err) {

    //         console.error('Approve failed:', err);
    //         message.error('Failed to approve contribution. Please try again.');

    //     } finally {

    //         setApproving(false);
    //     }
    // };


    const handleConfirmApprove = async () => {
        if (!approveRequest || !approveContribution) return;

        if (!isApproveFormValid) {
            message.error('Please fill in all required fields.');
            return;
        }

        try {
            setApproving(true);

            // MaterialsV2 uses "Pyq" (singular), not "Pyqs".
            const sectionKey =
                activeSection === 'Pyqs' ? 'Pyq' : activeSection;

            const year = approveForm.year.trim();
            const branch = approveForm.branch.trim();
            const subName = approveForm.subName.trim();
            const subCode = approveForm.subCode.trim();

            const downloadUrl = approveContribution.downloadUrl?.trim();

            if (!downloadUrl) {
                throw new Error('The contribution has no download URL.');
            }

            // Generate one ID and reuse it in both branches.
            const itemsSectionRef = dbRef(
                db,
                `${MATERIALS_V2_ITEMS_ROOT}/${sectionKey}/${year}/${branch}`
            );

            const newMaterialRef = push(itemsSectionRef);
            const newMaterialId = newMaterialRef.key;

            if (!newMaterialId) {
                throw new Error('Unable to generate material ID.');
            }

            const now = Date.now();

            // Match the field names and data types in MaterialsV2 JSON.
            const encryptedUrl = encryptAES(
                downloadUrl,
                REQUESTS_AES_SECRET_KEY
            );

            const materialData = {
                active: true,
                by: 'Engineers At AKTU',
                createdAt: now,
                dislikes: 0,
                id: newMaterialId,
                likes: 0,
                pdf: encryptedUrl,
                sub_code: subCode,
                sub_name: subName,
                title: subName,
                updatedAt: now,
                videoUrl: encryptedUrl,
            };

            const updates: Record<string, any> = {};

            const materialPath =
                `${sectionKey}/${year}/${branch}/${newMaterialId}`;

            // 1. Main material collection.
            updates[
                `${MATERIALS_V2_ITEMS_ROOT}/${materialPath}`
            ] = materialData;

            // 2. Active index — identical ID and payload.
            updates[
                `${MATERIALS_V2_ACTIVE_INDEX_ROOT}/${materialPath}`
            ] = materialData;

            // 3. Mark the contribution as approved.
            updates[
                `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${approveRequest.id}/contributions/${approveContribution.id}/status`
            ] = 'APPROVED';

            // 4. Link the approved contribution to the material.
            updates[
                `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${approveRequest.id}/contributions/${approveContribution.id}/materialId`
            ] = newMaterialId;


            // 5. Save the location where the material was published.
            // The Cloud Function will use this to build the notification.
            const contributionPath =
                `${PUBLISHED_REQUESTS_ROOT}/${activeSection}/${approveRequest.id}` +
                `/contributions/${approveContribution.id}`;

            updates[`${contributionPath}/materialSection`] = sectionKey;
            updates[`${contributionPath}/materialYear`] = year;
            updates[`${contributionPath}/materialBranch`] = branch;



            // All writes succeed or fail together.
            await update(dbRef(db), updates);

            // Update the local admin panel state.
            setAllData(ds =>
                ds.map(r => {
                    if (r.id !== approveRequest.id) return r;

                    return {
                        ...r,
                        contributions: r.contributions.map(c =>
                            c.id === approveContribution.id
                                ? {
                                    ...c,
                                    status: 'APPROVED',
                                    materialId: newMaterialId,
                                }
                                : c
                        ),
                    };
                })
            );

            message.success('Contribution approved and added to MaterialsV2.');

            setApproveModalVisible(false);
            setApproveRequest(null);
            setApproveContribution(null);
            setApproveForm(EMPTY_APPROVE_FORM);
            setContributorName('');
        } catch (err) {
            console.error('Error approving contribution:', err);
            message.error(
                err instanceof Error
                    ? err.message
                    : 'Failed to approve contribution.'
            );
        } finally {
            setApproving(false);
        }
    };



    // ==========================================================
    // ROW ACTION MENU (3-dot dropdown)
    // ==========================================================

    const getActionMenu = (
        record: PublishedRequestRecord
    ): MenuProps['items'] => [

            {
                key: 'view',
                label: 'View',
                onClick: () => {
                    setSelectedItem(record);
                    setViewModalVisible(true);
                },
            },

            {
                key: 'edit',
                label: 'Edit',
                onClick: () => openEditModal(record),
            },

            {
                key: 'contributions',
                label: `View Contributions (${record.contributions.length})`,
                onClick: () => {
                    setContributionsItem(record);
                    setContributionsModalVisible(true);
                },
            },

            {
                type: 'divider',
            },

            record.active
                ? {
                    key: 'deactivate',
                    label: (
                        <Popconfirm
                            title="Deactivate this request?"
                            description="This soft-deletes it — data stays in Firebase, it just won't show as active."
                            okText="Deactivate"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => handleToggleActive(record, false)}
                        >
                            <span style={{ color: '#ff4d4f' }}>Deactivate</span>
                        </Popconfirm>
                    ),
                }
                : {
                    key: 'restore',
                    label: 'Restore',
                    onClick: () => handleToggleActive(record, true),
                },
        ];


    // ==========================================================
    // TABLE COLUMNS
    // ==========================================================

    const columns: ColumnsType<PublishedRequestRecord> = [

        {
            title: 'Title',
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => (
                <div style={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}>
                    {text}
                </div>
            ),
        },

        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
        },

        {
            title: 'Status',
            key: 'status',
            render: (_, record) => (
                <Tag color={getStatusColor(record.status)}>{record.status}</Tag>
            ),
        },

        {
            title: 'Requesters',
            dataIndex: 'requesterCount',
            key: 'requesterCount',
        },

        {
            title: 'Contributions',
            dataIndex: 'contributionCount',
            key: 'contributionCount',
        },

        {
            title: 'Published Date',
            dataIndex: 'publishedDate',
            key: 'publishedDate',
        },

        {
            title: 'Active',
            key: 'active',
            render: (_, record) => (
                <Tag color={record.active ? 'green' : 'default'}>
                    {record.active ? 'Active' : 'Inactive'}
                </Tag>
            ),
        },

        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Dropdown
                    menu={{ items: getActionMenu(record) }}
                    trigger={['click']}
                >
                    <Button icon={<MoreOutlined />} />
                </Dropdown>
            ),
        },
    ];


    // ==========================================================
    // CONTRIBUTIONS TABLE COLUMNS
    // ==========================================================

    const contributionColumns: ColumnsType<Contribution> = [

        {
            title: 'File Name',
            dataIndex: 'fileName',
            key: 'fileName',
        },

        {
            title: 'User ID',
            dataIndex: 'userId',
            key: 'userId',
            render: (text: string) => (
                <div style={{ maxWidth: 180, wordBreak: 'break-all', fontSize: 12 }}>
                    {text}
                </div>
            ),
        },

        {
            title: 'Message',
            dataIndex: 'message',
            key: 'message',
            render: (text: string) =>
                text || <span style={{ color: '#888' }}>—</span>,
        },

        {
            title: 'Submitted At',
            dataIndex: 'submittedAt',
            key: 'submittedAt',
        },

        {
            title: 'Status',
            key: 'status',
            render: (_, record) => (
                <div>
                    <Tag color={getContributionStatusColor(record.status)}>
                        {record.status}
                    </Tag>
                    {record.status === 'APPROVED' && record.materialId && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                            Material ID: {record.materialId}
                        </div>
                    )}
                </div>
            ),
        },

        {
            title: 'File',
            key: 'file',
            render: (_, record) =>
                record.downloadUrl ? (
                    <a href={record.downloadUrl} target="_blank" rel="noreferrer">
                        View
                    </a>
                ) : (
                    <span style={{ color: '#888' }}>—</span>
                ),
        },

        {
            title: 'Action',
            key: 'action',
            render: (_, record) => {

                if (!contributionsItem) return null;

                if (record.status !== 'PENDING') {
                    return <span style={{ color: '#888' }}>—</span>;
                }

                return (
                    <div style={{ display: 'flex', gap: 8 }}>

                        <Button
                            type="primary"
                            size="small"
                            onClick={() =>
                                openApproveModal(contributionsItem, record)
                            }
                        >
                            Approve
                        </Button>

                        <Popconfirm
                            title="Reject this contribution?"
                            okText="Reject"
                            okButtonProps={{ danger: true }}
                            onConfirm={() =>
                                handleRejectContribution(contributionsItem, record.id)
                            }
                        >
                            <Button danger size="small">
                                Reject
                            </Button>
                        </Popconfirm>

                    </div>
                );
            },
        },
    ];


    // ==========================================================
    // RENDER
    // ==========================================================

    return (

        <ConfigProvider
            theme={{
                algorithm: darkMode
                    ? antdTheme.darkAlgorithm
                    : antdTheme.defaultAlgorithm,
            }}
        >

            <div
                style={{
                    padding: 24,
                    background: darkMode ? '#141414' : '#fff',
                    minHeight: '100vh',
                    color: darkMode ? '#e6e6e6' : 'inherit',
                }}
            >

                {/* ========================================================
            HEADER
            ======================================================== */}

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 16,
                        alignItems: 'center',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}
                >

                    <h2 style={{ color: darkMode ? '#e6e6e6' : 'inherit' }}>
                        Published Requests
                    </h2>

                    <Space size={16} wrap>

                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <SunOutlined />
                            <Switch checked={darkMode} onChange={setDarkMode} />
                            <MoonOutlined />
                        </span>

                        <span>
                            Show inactive:{' '}
                            <Switch checked={showInactive} onChange={setShowInactive} />
                        </span>

                        <span>
                            <strong>Total:</strong> {filteredData.length}
                        </span>

                        <Button type="primary" onClick={openCreateModal}>
                            New Published Request
                        </Button>

                    </Space>

                </div>


                {/* ========================================================
            SECTION TABS
            ======================================================== */}

                <Tabs
                    activeKey={activeSection}
                    onChange={key => setActiveSection(key)}
                    style={{ marginBottom: 16 }}
                >
                    {SECTION_KEYS.map((key, idx) => (
                        <TabPane tab={SECTION_LABELS[idx]} key={key} />
                    ))}
                </Tabs>


                {/* ========================================================
            TABLE
            ======================================================== */}

                {loading ? (

                    <Spin
                        size="large"
                        style={{ display: 'block', margin: '100px auto' }}
                    />

                ) : (

                    <Table<PublishedRequestRecord>
                        dataSource={filteredData}
                        columns={columns}
                        rowKey="id"
                        pagination={{ pageSize: 8 }}
                        scroll={{ x: true }}
                    />
                )}


                {/* ========================================================
            VIEW MODAL
            ======================================================== */}

                <Modal
                    open={viewModalVisible}
                    title="Published Request Details"
                    onCancel={() => setViewModalVisible(false)}
                    footer={
                        <Button onClick={() => setViewModalVisible(false)}>
                            Close
                        </Button>
                    }
                    width={700}
                >

                    {selectedItem && (

                        <>

                            <p><strong>Title:</strong> {selectedItem.title}</p>
                            <p><strong>Category:</strong> {selectedItem.category}</p>
                            <p><strong>Description:</strong> {selectedItem.description}</p>
                            <p><strong>Published Date:</strong> {selectedItem.publishedDate}</p>
                            <p><strong>Original Request ID:</strong> {selectedItem.originalRequestId}</p>
                            <p><strong>Requester Count:</strong> {selectedItem.requesterCount}</p>
                            <p><strong>Contribution Count:</strong> {selectedItem.contributionCount}</p>

                            <p>
                                <strong>Active:</strong>{' '}
                                <Tag color={selectedItem.active ? 'green' : 'default'}>
                                    {selectedItem.active ? 'Active' : 'Inactive'}
                                </Tag>
                            </p>

                            {/* STATUS QUICK CHANGE */}

                            <div style={{ marginTop: 16 }}>

                                <strong>Status:</strong>

                                <Select
                                    value={selectedItem.status}
                                    style={{ marginLeft: 10, width: 200 }}
                                    onChange={value =>
                                        handleStatusChange(selectedItem.id, value)
                                    }
                                >
                                    <Option value="OPEN">OPEN</Option>
                                    <Option value="UNDER_REVIEW">UNDER_REVIEW</Option>
                                    <Option value="FULFILLED">FULFILLED</Option>
                                    <Option value="CLOSED">CLOSED</Option>
                                </Select>

                            </div>

                        </>
                    )}

                </Modal>


                {/* ========================================================
            VIEW CONTRIBUTIONS MODAL
            ======================================================== */}

                <Modal
                    open={contributionsModalVisible}
                    title={
                        contributionsItem
                            ? `Contributions — ${contributionsItem.title}`
                            : 'Contributions'
                    }
                    onCancel={() => setContributionsModalVisible(false)}
                    footer={
                        <Button onClick={() => setContributionsModalVisible(false)}>
                            Close
                        </Button>
                    }
                    width={1000}
                >

                    {contributionsItem && (

                        <Table<Contribution>
                            dataSource={contributionsItem.contributions}
                            columns={contributionColumns}
                            rowKey="id"
                            pagination={{ pageSize: 6 }}
                            scroll={{ x: true }}
                            locale={{ emptyText: 'No contributions submitted yet.' }}
                        />
                    )}

                </Modal>


                {/* ========================================================
            APPROVE — ADD TO MATERIALS MODAL
            ======================================================== */}

                <Modal
                    open={approveModalVisible}
                    title="Approve Contribution — Add to Materials"
                    onCancel={closeApproveModal}
                    maskClosable={!approving}
                    closable={!approving}
                    width={600}
                    footer={
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>

                            <Button onClick={closeApproveModal} disabled={approving}>
                                Cancel
                            </Button>

                            <Popconfirm
                                title="Add this file to the app's Materials library?"
                                description="This will make the file publicly visible in the app and cannot be undone from here."
                                okText="Yes, submit"
                                cancelText="No"
                                onConfirm={handleConfirmApprove}
                                disabled={!isApproveFormValid || approving}
                            >
                                <Button
                                    type="primary"
                                    loading={approving}
                                    disabled={!isApproveFormValid}
                                >
                                    Submit
                                </Button>
                            </Popconfirm>

                        </div>
                    }
                >

                    {approveContribution && (

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                            {/* CONTRIBUTION INFO (read-only) */}

                            <div
                                style={{
                                    padding: 12,
                                    background: darkMode ? '#1f1f1f' : '#f5f5f5',
                                    borderRadius: 6,
                                }}
                            >

                                <div><strong>File:</strong> {approveContribution.fileName}</div>

                                <div style={{ marginTop: 4 }}>
                                    <strong>Contributor:</strong>{' '}
                                    {contributorLoading ? (
                                        <Spin size="small" />
                                    ) : (
                                        contributorName
                                    )}
                                </div>

                                <div style={{ marginTop: 4 }}>
                                    <strong>Category:</strong> {activeSection}
                                </div>

                                <div style={{ marginTop: 4 }}>
                                    <strong>Date:</strong> {getCurrentDateSlash()} (auto)
                                </div>

                                {approveContribution.message && (
                                    <div style={{ marginTop: 4 }}>
                                        <strong>Note from contributor:</strong>{' '}
                                        {approveContribution.message}
                                    </div>
                                )}

                            </div>


                            {/* YEAR */}

                            <div>
                                <strong>Year</strong>
                                <Select
                                    style={{ width: '100%', marginTop: 6 }}
                                    value={approveForm.year}
                                    onChange={value =>
                                        setApproveForm(prev => ({ ...prev, year: value }))
                                    }
                                >
                                    {YEAR_OPTIONS.map(y => (
                                        <Option key={y} value={y}>
                                            {y.replace('_', ' ')}
                                        </Option>
                                    ))}
                                </Select>
                            </div>


                            {/* BRANCH */}

                            <div>
                                <strong>Branch</strong>
                                <AutoComplete
                                    style={{ width: '100%', marginTop: 6 }}
                                    value={approveForm.branch}
                                    options={BRANCH_OPTIONS.map(b => ({ value: b }))}
                                    filterOption={(inputValue, option) =>
                                        (option?.value as string)
                                            .toLowerCase()
                                            .includes(inputValue.toLowerCase())
                                    }
                                    onChange={value =>
                                        setApproveForm(prev => ({ ...prev, branch: value }))
                                    }
                                    placeholder="Select or type a branch"
                                />
                            </div>


                            {/* SUBJECT NAME */}

                            <div>
                                <strong>Subject Name</strong>
                                <Input
                                    style={{ marginTop: 6 }}
                                    placeholder="Enter subject name"
                                    value={approveForm.subName}
                                    onChange={e =>
                                        setApproveForm(prev => ({
                                            ...prev,
                                            subName: e.target.value,
                                        }))
                                    }
                                />
                            </div>


                            {/* SUBJECT CODE */}

                            <div>
                                <strong>Subject Code</strong>
                                <Input
                                    style={{ marginTop: 6 }}
                                    placeholder="Enter subject code"
                                    value={approveForm.subCode}
                                    onChange={e =>
                                        setApproveForm(prev => ({
                                            ...prev,
                                            subCode: e.target.value,
                                        }))
                                    }
                                />
                            </div>


                            {/* FILE LINK */}

                            <div>
                                <a
                                    href={approveContribution.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Preview attached file
                                </a>
                            </div>

                        </div>
                    )}

                </Modal>


                {/* ========================================================
            CREATE / EDIT MODAL
            ======================================================== */}

                <Modal
                    open={formModalVisible}
                    title={
                        formMode === 'create'
                            ? 'New Published Request'
                            : 'Edit Published Request'
                    }
                    onCancel={closeFormModal}
                    confirmLoading={saving}
                    onOk={handleSaveForm}
                    okText={formMode === 'create' ? 'Create' : 'Save'}
                    cancelText="Cancel"
                    width={600}
                    maskClosable={!saving}
                    closable={!saving}
                >

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                        <div>
                            <strong>Title</strong>
                            <Input
                                style={{ marginTop: 6 }}
                                placeholder="Enter request title"
                                value={form.title}
                                onChange={e =>
                                    setForm(prev => ({ ...prev, title: e.target.value }))
                                }
                            />
                        </div>

                        <div>
                            <strong>Description</strong>
                            <Input.TextArea
                                rows={5}
                                style={{ marginTop: 6 }}
                                placeholder="Enter request description"
                                value={form.description}
                                onChange={e =>
                                    setForm(prev => ({ ...prev, description: e.target.value }))
                                }
                            />
                        </div>

                        <div>
                            <strong>Category</strong>
                            <Select
                                style={{ width: '100%', marginTop: 6 }}
                                value={form.category}
                                onChange={value =>
                                    setForm(prev => ({ ...prev, category: value }))
                                }
                            >
                                {SECTION_KEYS.map((key, idx) => (
                                    <Option key={key} value={key}>
                                        {SECTION_LABELS[idx]}
                                    </Option>
                                ))}
                            </Select>
                        </div>

                        <div>
                            <strong>Status</strong>
                            <Select
                                style={{ width: '100%', marginTop: 6 }}
                                value={form.status}
                                onChange={value =>
                                    setForm(prev => ({ ...prev, status: value }))
                                }
                            >
                                <Option value="OPEN">OPEN</Option>
                                <Option value="UNDER_REVIEW">UNDER_REVIEW</Option>
                                <Option value="FULFILLED">FULFILLED</Option>
                                <Option value="CLOSED">CLOSED</Option>
                            </Select>
                        </div>

                        <div>
                            <strong>Published Date</strong>
                            <Input
                                style={{ marginTop: 6 }}
                                placeholder="DD-MM-YYYY"
                                value={form.publishedDate}
                                onChange={e =>
                                    setForm(prev => ({
                                        ...prev,
                                        publishedDate: e.target.value,
                                    }))
                                }
                            />
                        </div>

                        <div>
                            <strong>Requester Count</strong>
                            <InputNumber
                                style={{ width: '100%', marginTop: 6 }}
                                min={0}
                                value={form.requesterCount}
                                onChange={value =>
                                    setForm(prev => ({
                                        ...prev,
                                        requesterCount: value || 0,
                                    }))
                                }
                            />
                        </div>

                        <div>
                            <strong>Original Request ID (optional)</strong>
                            <Input
                                style={{ marginTop: 6 }}
                                placeholder="Link to original UserRequests entry, if any"
                                value={form.originalRequestId}
                                onChange={e =>
                                    setForm(prev => ({
                                        ...prev,
                                        originalRequestId: e.target.value,
                                    }))
                                }
                            />
                        </div>

                    </div>

                </Modal>

            </div>

        </ConfigProvider>
    );
};


export default PublishedRequestsAdmin;