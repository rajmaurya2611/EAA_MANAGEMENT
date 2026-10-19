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
  ConfigProvider,
  theme as antdTheme,
} from 'antd';
import { BulbOutlined, BulbFilled } from '@ant-design/icons';

import type { ColumnsType } from 'antd/es/table';

import { db } from '../../firebaseConfig';

import {
  ref as dbRef,
  onValue,
  update,
  push,
} from 'firebase/database';

import CryptoJS from 'crypto-js';

const { Option } = Select;

// ============================================================
// AES KEYS
// ============================================================

const USER_AES_SECRET_KEY =
  import.meta.env.VITE_AES_SECRET_KEY as string;

const REQUESTS_AES_SECRET_KEY =
  import.meta.env.VITE_MATERIALS_AES_SECRET_KEY as string;


// ============================================================
// CATEGORIES
// ============================================================

/*
 * These keys MUST match the exact node names used under
 * `version12/UserRequests/<key>` and `version12/PublishedRequests/<key>`
 * in Firebase. Add/remove entries here to add/remove tabs —
 * nothing else in this file needs to change.
 */
interface CategoryDef {
  key: string;
  label: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'E-Book', label: 'E-Books' },
  { key: 'Notes', label: 'Notes' },
  { key: 'Pyqs', label: 'PYQs' },
  { key: 'Lectures', label: 'Lectures' },
  { key: 'Quantum', label: 'Quantum' },
  { key: 'Roadmaps', label: 'Roadmaps' },
  { key: 'Syllabus', label: 'Syllabus' },
];

const DEFAULT_CATEGORY = CATEGORIES[0].key;


// ============================================================
// THEME STORAGE
// ============================================================

const THEME_STORAGE_KEY = 'admin-panel-theme';

function loadStoredDarkMode(): boolean {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    /*
     * Dark mode is the default. Only explicit "light" turns it off.
     */
    if (stored === 'light') return false;
    return true;
  } catch {
    return true;
  }
}

function persistDarkMode(isDark: boolean) {
  try {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      isDark ? 'dark' : 'light'
    );
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}


// ============================================================
// AES HELPERS
// ============================================================

function decryptAES(ciphertext: string, key: string): string {
  try {
    const normalized = (ciphertext || '').replace(/\s+/g, '');

    const parsedKey = CryptoJS.enc.Utf8.parse(key);

    const dec = CryptoJS.AES.decrypt(
      normalized,
      parsedKey,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }
    );

    return dec.toString(CryptoJS.enc.Utf8);

  } catch (err) {
    console.error('AES decrypt error:', err);
    return ciphertext;
  }
}


function encryptAES(plain: string, key: string): string {
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);

    return CryptoJS.AES.encrypt(
      plain,
      parsedKey,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }
    ).toString();

  } catch (err) {
    console.error('AES encrypt error:', err);
    return plain;
  }
}


// ============================================================
// REQUEST MODEL
// ============================================================

interface RequestRecord {
  id: string;

  userId: string;

  userName: string;

  userCollege: string;

  date: string;

  time: string;

  status: string;

  text: string;

  // Publishing information
  published?: boolean;

  publishedRequestId?: string;
}


// ============================================================
// PUBLISHED REQUEST FORM
// ============================================================

interface PublishForm {
  title: string;

  description: string;

  category: string;

  status: string;

  publishedDate: string;
}


// ============================================================
// DATE + TIME → EPOCH
// ============================================================

function dtToMs(
  dateStr: string,
  timeStr: string
): number {

  if (!dateStr) return 0;

  const [dRaw, mRaw, yRaw] =
    dateStr.split(/[-/]/);

  const d = parseInt(dRaw ?? '0', 10);

  const m = parseInt(mRaw ?? '0', 10);

  const y = parseInt(yRaw ?? '0', 10);

  const [
    hhRaw = '0',
    mmRaw = '0',
    ssRaw = '0',
  ] = (timeStr || '').split(':');

  const hh = parseInt(hhRaw, 10) || 0;

  const mm = parseInt(mmRaw, 10) || 0;

  const ss = parseInt(ssRaw, 10) || 0;

  if (!y || !m || !d) return 0;

  const t = new Date(
    y,
    m - 1,
    d,
    hh,
    mm,
    ss
  ).getTime();

  return Number.isFinite(t) ? t : 0;
}


// ============================================================
// CURRENT DATE
// DD-MM-YYYY
// ============================================================

function getCurrentDate(): string {

  const now = new Date();

  const day = String(
    now.getDate()
  ).padStart(2, '0');

  const month = String(
    now.getMonth() + 1
  ).padStart(2, '0');

  const year = now.getFullYear();

  return `${day}-${month}-${year}`;
}


// ============================================================
// GENERATE DEFAULT TITLE
// ============================================================

function generateDefaultTitle(
  text: string,
  categoryLabel: string
): string {

  if (!text) {
    return `${categoryLabel} Request`;
  }

  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return `${categoryLabel} Request`;
  }

  /*
   * Try to use the first sentence as the title.
   */
  const firstSentence = cleaned.split(/[.!?]/)[0].trim();

  if (
    firstSentence.length > 0 &&
    firstSentence.length <= 80
  ) {
    return firstSentence;
  }

  /*
   * Otherwise truncate.
   */
  if (cleaned.length > 80) {
    return `${cleaned.substring(0, 77)}...`;
  }

  return cleaned;
}


// ============================================================
// COMPONENT
// ============================================================

const UserRequestsAdmin: React.FC = () => {

  // ==========================================================
  // THEME
  // ==========================================================

  const [darkMode, setDarkMode] = useState<boolean>(
    loadStoredDarkMode
  );

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      persistDarkMode(next);
      return next;
    });
  };

  /*
   * Theme-aware surface colors for the plain inline-styled
   * areas of this component (antd components themselve pick
   * up the algorithm automatically via ConfigProvider below).
   */
  const surfaceStyles = useMemo(
    () => ({
      pageBg: darkMode ? '#141414' : '#fff',
      cardBg: darkMode ? '#1f1f1f' : '#f5f5f5',
      cardBorder: darkMode ? '#303030' : '#eee',
      mutedText: darkMode ? '#a6a6a6' : '#666',
      warningBg: darkMode ? '#2b2111' : '#fffbe6',
      warningBorder: darkMode ? '#876800' : '#ffe58f',
      metaBg: darkMode ? '#1a1a1a' : '#fafafa',
      metaBorder: darkMode ? '#303030' : '#eee',
    }),
    [darkMode]
  );


  // ==========================================================
  // CATEGORY (TAB) SELECTION
  // ==========================================================

  const [
    category,
    setCategory,
  ] = useState<string>(DEFAULT_CATEGORY);

  const categoryLabel =
    CATEGORIES.find(c => c.key === category)?.label ?? category;


  // ==========================================================
  // USER DATA
  // ==========================================================

  const [
    userData,
    setUserData,
  ] = useState<
    Record<
      string,
      {
        name: string;
        college: string;
      }
    >
  >({});


  // ==========================================================
  // REQUEST DATA
  // ==========================================================

  const [
    allData,
    setAllData,
  ] = useState<RequestRecord[]>([]);

  const [
    filteredData,
    setFilteredData,
  ] = useState<RequestRecord[]>([]);


  // ==========================================================
  // LOADING
  // ==========================================================

  const [
    loading,
    setLoading,
  ] = useState(true);


  // ==========================================================
  // VIEW MODAL
  // ==========================================================

  const [
    selectedItem,
    setSelectedItem,
  ] = useState<RequestRecord | null>(null);

  const [
    modalVisible,
    setModalVisible,
  ] = useState(false);


  // ==========================================================
  // STATUS FILTER
  // ==========================================================

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<
    'all' |
    'pending' |
    'resolved' |
    'not resolved'
  >('all');


  const [
    statusChangedTo,
    setStatusChangedTo,
  ] = useState<string | null>(null);


  // ==========================================================
  // PUBLISH MODAL
  // ==========================================================

  const [
    publishModalVisible,
    setPublishModalVisible,
  ] = useState(false);


  const [
    publishingItem,
    setPublishingItem,
  ] = useState<RequestRecord | null>(null);


  const [
    publishing,
    setPublishing,
  ] = useState(false);


  const [
    publishForm,
    setPublishForm,
  ] = useState<PublishForm>({
    title: '',
    description: '',
    category,
    status: 'OPEN',
    publishedDate: '',
  });


  // ==========================================================
  // 1. LOAD USERS
  // ==========================================================

  useEffect(() => {

    const usersRef = dbRef(
      db,
      'version12/users'
    );

    const unsub = onValue(
      usersRef,
      snap => {

        const raw = snap.val() || {};

        const map: Record<
          string,
          {
            name: string;
            college: string;
          }
        > = {};

        Object.entries(raw).forEach(
          ([uid, entry]: [string, any]) => {

            map[uid] = {
              name: decryptAES(
                entry.name || '',
                USER_AES_SECRET_KEY
              ),

              college: decryptAES(
                entry.college || '',
                USER_AES_SECRET_KEY
              ),
            };

          }
        );

        setUserData(map);

      }
    );

    return () => unsub();

  }, []);


  // ==========================================================
  // 2. LOAD REQUESTS FOR THE SELECTED CATEGORY
  // ==========================================================

  useEffect(() => {

    setLoading(true);

    const requestRef = dbRef(
      db,
      `version12/UserRequests/${category}`
    );

    const unsub = onValue(
      requestRef,
      snap => {

        const raw = snap.val() || {};

        const parsed: RequestRecord[] =
          Object.entries(raw).map(
            ([id, entry]: [string, any]) => {

              const uid = decryptAES(
                entry.userId || '',
                REQUESTS_AES_SECRET_KEY
              );

              const user =
                userData[uid] || {
                  name: 'Unknown',
                  college: 'Unknown',
                };


              return {
                id,

                userId: uid,

                userName: user.name,

                userCollege: user.college,

                date: decryptAES(
                  entry.date || '',
                  REQUESTS_AES_SECRET_KEY
                ),

                time: decryptAES(
                  entry.time || '',
                  REQUESTS_AES_SECRET_KEY
                ),

                status: decryptAES(
                  entry.status || '',
                  REQUESTS_AES_SECRET_KEY
                ).toLowerCase(),

                text: decryptAES(
                  entry.text || '',
                  REQUESTS_AES_SECRET_KEY
                ),

                /*
                 * These are not encrypted because they are
                 * internal Firebase metadata.
                 */
                published:
                  entry.published === true,

                publishedRequestId:
                  entry.publishedRequestId || '',
              };

            }
          );


        setAllData(parsed);

        setLoading(false);

      },

      err => {

        console.error(
          `Fetch ${category} error:`,
          err
        );

        message.error(
          `Failed to load ${categoryLabel} requests.`
        );

        setLoading(false);

      }
    );

    return () => unsub();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, category]);


  // ==========================================================
  // 3. STATUS FILTER + NEWEST FIRST
  // ==========================================================

  useEffect(() => {

    const base =
      statusFilter === 'all'
        ? allData
        : allData.filter(
            r =>
              r.status === statusFilter
          );


    const sorted = [...base].sort(
      (a, b) =>
        dtToMs(
          b.date,
          b.time
        ) -
        dtToMs(
          a.date,
          a.time
        )
    );


    setFilteredData(sorted);

  }, [
    allData,
    statusFilter,
  ]);


  // ==========================================================
  // RESET UI STATE WHEN SWITCHING TABS
  // ==========================================================

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setStatusFilter('all');
    setStatusChangedTo(null);
    setSelectedItem(null);
    setModalVisible(false);
  };


  // ==========================================================
  // 4. STATUS UPDATE
  // ==========================================================

  const handleStatusChange = async (
    id: string,
    newStatus: string
  ) => {

    try {

      await update(
        dbRef(
          db,
          `version12/UserRequests/${category}/${id}`
        ),
        {
          status: encryptAES(
            newStatus,
            REQUESTS_AES_SECRET_KEY
          ),
        }
      );


      setAllData(
        ds =>
          ds.map(
            r =>
              r.id === id
                ? {
                    ...r,
                    status: newStatus,
                  }
                : r
          )
      );


      if (
        selectedItem?.id === id
      ) {

        setSelectedItem({
          ...selectedItem,
          status: newStatus,
        });

      }


      setStatusChangedTo(
        newStatus
      );


      message.success(
        `Status updated to "${newStatus}"`
      );

    } catch (err) {

      console.error(
        'Status update failed:',
        err
      );

      message.error(
        'Failed to update status'
      );

    }

  };


  // ==========================================================
  // STATUS COLOR
  // ==========================================================

  const getStatusColor = (
    status: string
  ) => {

    if (status === 'resolved') {
      return 'green';
    }

    if (status === 'not resolved') {
      return 'red';
    }

    return 'gold';
  };


  // ==========================================================
  // OPEN PUBLISH MODAL
  // ==========================================================

  const openPublishModal = (
    item: RequestRecord
  ) => {

    /*
     * Safety check.
     *
     * This also handles old Firebase records which don't
     * have the "published" field yet.
     */
    if (item.published) {

      message.info(
        'This request has already been published.'
      );

      return;
    }


    setPublishingItem(item);


    /*
     * Pre-fill whatever we can.
     */
    setPublishForm({

      /*
       * Automatically generate a title from the request.
       * Admin can edit it.
       */
      title: generateDefaultTitle(
        item.text,
        categoryLabel
      ),

      /*
       * Original request becomes description.
       */
      description: item.text,

      /*
       * Defaults to the currently active tab's category.
       */
      category,

      /*
       * Every newly published request starts OPEN.
       */
      status: 'OPEN',

      /*
       * Automatically use today's date.
       */
      publishedDate: getCurrentDate(),

    });


    setPublishModalVisible(true);
  };


  // ==========================================================
  // CLOSE PUBLISH MODAL
  // ==========================================================

  const closePublishModal = () => {

    if (publishing) {
      return;
    }

    setPublishModalVisible(false);

    setPublishingItem(null);

    setPublishForm({
      title: '',
      description: '',
      category,
      status: 'OPEN',
      publishedDate: '',
    });

  };


  // ==========================================================
  // HANDLE PUBLISH
  // ==========================================================

  const handlePublish = async () => {

    if (!publishingItem) {
      return;
    }


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!publishForm.title.trim()) {

      message.error(
        'Please enter a title.'
      );

      return;
    }


    if (!publishForm.description.trim()) {

      message.error(
        'Please enter a description.'
      );

      return;
    }


    if (!publishForm.category.trim()) {

      message.error(
        'Please select a category.'
      );

      return;
    }


    if (!publishForm.status.trim()) {

      message.error(
        'Please select a status.'
      );

      return;
    }


    if (!publishForm.publishedDate.trim()) {

      message.error(
        'Please enter a published date.'
      );

      return;
    }


    // --------------------------------------------------------
    // DUPLICATE PROTECTION
    // --------------------------------------------------------

    if (publishingItem.published) {

      message.warning(
        'This request has already been published.'
      );

      closePublishModal();

      return;
    }


    /*
     * The published item can target a different node than the
     * tab it originated from (rare, but the category select
     * in the modal allows it), so use publishForm.category for
     * writes to PublishedRequests and `category` (the source
     * tab) for the original UserRequests node.
     */
    const publishTargetCategory = publishForm.category.trim();


    try {

      setPublishing(true);


      // ------------------------------------------------------
      // CREATE NEW PUBLISHED REQUEST ID
      // ------------------------------------------------------

      const publishedCollectionRef =
        dbRef(
          db,
          `version12/PublishedRequests/${publishTargetCategory}`
        );


      const newPublishedRef =
        push(
          publishedCollectionRef
        );


      const publishedRequestId =
        newPublishedRef.key;


      if (!publishedRequestId) {

        throw new Error(
          'Unable to generate published request ID.'
        );

      }


      // ------------------------------------------------------
      // REQUESTER COUNT
      // ------------------------------------------------------

      /*
       * For MVP, this request currently represents the
       * original requester.
       *
       * Later, "I NEED THIS TOO" can increment this value.
       */
      const requesterCount = 1;


      // ------------------------------------------------------
      // CONTRIBUTION COUNT
      // ------------------------------------------------------

      /*
       * No contribution exists when the request is first
       * published.
       */
      const contributionCount = 0;


      // ------------------------------------------------------
      // PUBLISHED REQUEST DATA
      // ------------------------------------------------------

      const publishedData = {

        title: encryptAES(
          publishForm.title.trim(),
          REQUESTS_AES_SECRET_KEY
        ),

        description: encryptAES(
          publishForm.description.trim(),
          REQUESTS_AES_SECRET_KEY
        ),

        category: encryptAES(
          publishTargetCategory,
          REQUESTS_AES_SECRET_KEY
        ),

        /*
         * This connects the public request to the original
         * private request.
         */
        originalRequestId:
          publishingItem.id,

        publishedDate: encryptAES(
          publishForm.publishedDate.trim(),
          REQUESTS_AES_SECRET_KEY
        ),

        status: encryptAES(
          publishForm.status.trim(),
          REQUESTS_AES_SECRET_KEY
        ),

        requesterCount,

        contributionCount,

        /*
         * Useful later for sorting/filtering.
         * This is intentionally not encrypted.
         */
        createdAt: Date.now(),
      };


      // ------------------------------------------------------
      // ATOMIC MULTI-LOCATION UPDATE
      // ------------------------------------------------------

      /*
       * IMPORTANT:
       *
       * We update BOTH locations in one Firebase update.
       *
       * 1. Create PublishedRequests entry
       * 2. Mark original request as published
       *
       * This is safer than doing two independent writes.
       */

      const updates: Record<string, any> = {};


      // ------------------------------------------------------
      // NEW PUBLISHED NODE
      // ------------------------------------------------------

      updates[
        `version12/PublishedRequests/${publishTargetCategory}/${publishedRequestId}`
      ] = publishedData;


      // ------------------------------------------------------
      // ORIGINAL USER REQUEST
      // ------------------------------------------------------

      updates[
        `version12/UserRequests/${category}/${publishingItem.id}/published`
      ] = true;


      updates[
        `version12/UserRequests/${category}/${publishingItem.id}/publishedRequestId`
      ] = publishedRequestId;


      /*
       * Also change original status to "published".
       *
       * This gives your existing admin panel an immediate
       * indication that the request has already been handled.
       */
      updates[
        `version12/UserRequests/${category}/${publishingItem.id}/status`
      ] = encryptAES(
        'published',
        REQUESTS_AES_SECRET_KEY
      );


      // ------------------------------------------------------
      // WRITE EVERYTHING
      // ------------------------------------------------------

      await update(
        dbRef(db),
        updates
      );


      // ------------------------------------------------------
      // UPDATE LOCAL UI
      // ------------------------------------------------------

      setAllData(
        currentData =>
          currentData.map(
            item =>
              item.id === publishingItem.id
                ? {
                    ...item,

                    published: true,

                    publishedRequestId,

                    status: 'published',
                  }
                : item
          )
      );


      if (
        selectedItem?.id ===
        publishingItem.id
      ) {

        setSelectedItem({
          ...selectedItem,

          published: true,

          publishedRequestId,

          status: 'published',
        });

      }


      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      message.success(
        'Request published successfully.'
      );


      closePublishModal();


    } catch (error) {

      console.error(
        'Publish request failed:',
        error
      );

      message.error(
        'Failed to publish request. Please try again.'
      );

    } finally {

      setPublishing(false);

    }

  };


  // ==========================================================
  // TABLE COLUMNS
  // ==========================================================

  const columns: ColumnsType<RequestRecord> = [

    {
      title: 'User Name',
      dataIndex: 'userName',
      key: 'userName',
    },

    {
      title: 'College',
      dataIndex: 'userCollege',
      key: 'userCollege',
    },

    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },

    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
    },

    {
      title: 'Text',
      dataIndex: 'text',
      key: 'text',

      render: (text: string) => (

        <div
          style={{
            maxWidth: 300,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
          }}
        >
          {text}
        </div>

      ),
    },


    // --------------------------------------------------------
    // STATUS
    // --------------------------------------------------------

    {
      title: 'Status',
      key: 'status',

      render: (
        _,
        record
      ) => (

        <Tag
          color={
            record.status === 'published'
              ? 'blue'
              : getStatusColor(
                  record.status
                )
          }
        >
          {record.status}
        </Tag>

      ),
    },


    // --------------------------------------------------------
    // PUBLISHED
    // --------------------------------------------------------

    {
      title: 'Published',
      key: 'published',

      render: (
        _,
        record
      ) => {

        if (!record.published) {
          return (
            <Tag color="default">
              Not Published
            </Tag>
          );
        }


        return (
          <Tag color="green">
            Published ✓
          </Tag>
        );

      },
    },


    // --------------------------------------------------------
    // ACTION
    // --------------------------------------------------------

    {
      title: 'Action',
      key: 'action',

      render: (
        _,
        record
      ) => (

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >

          {/* VIEW */}

          <Button
            type="primary"
            onClick={() => {

              setSelectedItem(
                record
              );

              setStatusChangedTo(
                null
              );

              setModalVisible(
                true
              );

            }}
          >
            View
          </Button>


          {/* PUBLISH */}

          {record.published ? (

            <Button
              disabled
            >
              Published ✓
            </Button>

          ) : (

            <Button
              type="default"
              onClick={() =>
                openPublishModal(
                  record
                )
              }
            >
              Publish
            </Button>

          )}

        </div>

      ),
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
          background: surfaceStyles.pageBg,
          minHeight: '100vh',
        }}
      >

        {/* =====================================================
            HEADER
            ===================================================== */}

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

          <h2 style={{ margin: 0 }}>
            User Requests
          </h2>


          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >

            <Select
              value={statusFilter}
              onChange={value =>
                setStatusFilter(
                  value as
                    | 'all'
                    | 'pending'
                    | 'resolved'
                    | 'not resolved'
                )
              }
              style={{
                width: 180,
              }}
            >

              <Option value="all">
                All
              </Option>

              <Option value="pending">
                Pending
              </Option>

              <Option value="resolved">
                Resolved
              </Option>

              <Option value="not resolved">
                Not Resolved
              </Option>

            </Select>


            <span>
              <strong>
                Total:
              </strong>{' '}
              {filteredData.length}
            </span>


            <Button
              shape="circle"
              icon={
                darkMode
                  ? <BulbFilled />
                  : <BulbOutlined />
              }
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              title={
                darkMode
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
            />

          </div>

        </div>


        {/* =====================================================
            CATEGORY TABS
            ===================================================== */}

        <Tabs
          activeKey={category}
          onChange={handleCategoryChange}
          items={CATEGORIES.map(c => ({
            key: c.key,
            label: c.label,
          }))}
          style={{ marginBottom: 8 }}
        />


        {/* =====================================================
            TABLE
            ===================================================== */}

        {loading ? (

          <Spin
            size="large"
            style={{
              display: 'block',
              margin: '100px auto',
            }}
          />

        ) : (

          <Table<RequestRecord>
            dataSource={
              filteredData
            }

            columns={
              columns
            }

            rowKey="id"

            pagination={{
              pageSize: 8,
            }}

            scroll={{
              x: true,
            }}
          />

        )}


        {/* =====================================================
            VIEW REQUEST MODAL
            ===================================================== */}

        <Modal
          open={
            modalVisible
          }

          title={`${categoryLabel} Request Details`}

          onCancel={() =>
            setModalVisible(
              false
            )
          }

          footer={

            <Button
              onClick={() =>
                setModalVisible(
                  false
                )
              }
            >
              Close
            </Button>

          }
        >

          {selectedItem && (

            <>

              <p>
                <strong>
                  User ID:
                </strong>{' '}
                {selectedItem.userId}
              </p>


              <p>
                <strong>
                  User Name:
                </strong>{' '}
                {selectedItem.userName}
              </p>


              <p>
                <strong>
                  College:
                </strong>{' '}
                {selectedItem.userCollege}
              </p>


              <p>
                <strong>
                  Date:
                </strong>{' '}
                {selectedItem.date}
              </p>


              <p>
                <strong>
                  Time:
                </strong>{' '}
                {selectedItem.time}
              </p>


              <p>
                <strong>
                  Text:
                </strong>{' '}

                {selectedItem.text}
              </p>


              <p>
                <strong>
                  Published:
                </strong>{' '}

                {selectedItem.published
                  ? (
                    <Tag color="green">
                      Yes
                    </Tag>
                  )
                  : (
                    <Tag>
                      No
                    </Tag>
                  )}
              </p>


              {selectedItem.publishedRequestId && (

                <p>
                  <strong>
                    Published Request ID:
                  </strong>{' '}

                  {selectedItem.publishedRequestId}

                </p>

              )}


              {/* STATUS */}

              <div
                style={{
                  marginTop: 16,
                }}
              >

                <strong>
                  Status:
                </strong>


                <Select
                  value={
                    selectedItem.status
                  }

                  style={{
                    marginLeft: 10,
                    width: 180,
                  }}

                  onChange={value =>
                    handleStatusChange(
                      selectedItem.id,
                      value
                    )
                  }
                >

                  <Option value="pending">
                    Pending
                  </Option>

                  <Option value="resolved">
                    Resolved
                  </Option>

                  <Option value="not resolved">
                    Not Resolved
                  </Option>

                  <Option value="published">
                    Published
                  </Option>

                </Select>

              </div>


              {statusChangedTo && (

                <p
                  style={{
                    marginTop: 12,
                  }}
                >

                  ✅ Status changed to{' '}

                  <Tag
                    color={
                      getStatusColor(
                        statusChangedTo
                      )
                    }
                  >
                    {statusChangedTo}
                  </Tag>

                </p>

              )}

            </>

          )}

        </Modal>


        {/* =====================================================
            PUBLISH REQUEST MODAL
            ===================================================== */}

        <Modal
          open={
            publishModalVisible
          }

          title="Publish Request"

          onCancel={
            closePublishModal
          }

          confirmLoading={
            publishing
          }

          onOk={
            handlePublish
          }

          okText="Publish"

          cancelText="Cancel"

          width={600}

          maskClosable={
            !publishing
          }

          closable={
            !publishing
          }
        >

          {publishingItem && (

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >

              {/* =================================================
                  ORIGINAL REQUEST
                  ================================================= */}

              <div
                style={{
                  padding: 12,
                  background: surfaceStyles.cardBg,
                  borderRadius: 6,
                }}
              >

                <div
                  style={{
                    marginBottom: 6,
                  }}
                >

                  <strong>
                    Original Request
                  </strong>

                </div>


                <div
                  style={{
                    fontSize: 13,
                    color: surfaceStyles.mutedText,
                  }}
                >

                  {publishingItem.text}

                </div>

              </div>


              {/* =================================================
                  TITLE
                  ================================================= */}

              <div>

                <strong>
                  Public Title
                </strong>


                <Input
                  style={{
                    marginTop: 6,
                  }}

                  placeholder="Enter public request title"

                  value={
                    publishForm.title
                  }

                  onChange={e =>
                    setPublishForm(
                      previous => ({
                        ...previous,

                        title:
                          e.target.value,
                      })
                    )
                  }
                />

              </div>


              {/* =================================================
                  DESCRIPTION
                  ================================================= */}

              <div>

                <strong>
                  Description
                </strong>


                <Input.TextArea
                  rows={5}

                  style={{
                    marginTop: 6,
                  }}

                  placeholder="Enter public request description"

                  value={
                    publishForm.description
                  }

                  onChange={e =>
                    setPublishForm(
                      previous => ({
                        ...previous,

                        description:
                          e.target.value,
                      })
                    )
                  }
                />

              </div>


              {/* =================================================
                  CATEGORY
                  ================================================= */}

              <div>

                <strong>
                  Category
                </strong>


                <Select
                  style={{
                    width: '100%',
                    marginTop: 6,
                  }}

                  value={
                    publishForm.category
                  }

                  onChange={value =>
                    setPublishForm(
                      previous => ({
                        ...previous,

                        category:
                          value,
                      })
                    )
                  }
                >

                  {CATEGORIES.map(c => (
                    <Option key={c.key} value={c.key}>
                      {c.label}
                    </Option>
                  ))}

                </Select>

              </div>


              {/* =================================================
                  STATUS
                  ================================================= */}

              <div>

                <strong>
                  Public Status
                </strong>


                <Select
                  style={{
                    width: '100%',
                    marginTop: 6,
                  }}

                  value={
                    publishForm.status
                  }

                  onChange={value =>
                    setPublishForm(
                      previous => ({
                        ...previous,

                        status:
                          value,
                      })
                    )
                  }
                >

                  <Option value="OPEN">
                    OPEN
                  </Option>

                  <Option value="CLOSED">
                    CLOSED
                  </Option>

                </Select>

              </div>


              {/* =================================================
                  PUBLISHED DATE
                  ================================================= */}

              <div>

                <strong>
                  Published Date
                </strong>


                <Input
                  style={{
                    marginTop: 6,
                  }}

                  value={
                    publishForm.publishedDate
                  }

                  onChange={e =>
                    setPublishForm(
                      previous => ({
                        ...previous,

                        publishedDate:
                          e.target.value,
                      })
                    )
                  }
                />

              </div>


              {/* =================================================
                  ORIGINAL REQUEST ID
                  ================================================= */}

              <div>

                <strong>
                  Original Request ID
                </strong>


                <Input
                  style={{
                    marginTop: 6,
                  }}

                  value={
                    publishingItem.id
                  }

                  disabled
                />

              </div>


              {/* =================================================
                  AUTOMATIC METADATA
                  ================================================= */}

              <div
                style={{
                  padding: 12,
                  background: surfaceStyles.metaBg,
                  border: `1px solid ${surfaceStyles.metaBorder}`,
                  borderRadius: 6,
                }}
              >

                <div
                  style={{
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  Automatically Set
                </div>


                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    fontSize: 13,
                  }}
                >

                  <div>
                    Requester Count:{' '}
                    <strong>
                      1
                    </strong>
                  </div>


                  <div>
                    Contribution Count:{' '}
                    <strong>
                      0
                    </strong>
                  </div>


                  <div>
                    Original User:{' '}
                    <strong>
                      Not exposed publicly
                    </strong>
                  </div>


                  <div>
                    Published Request ID:{' '}
                    <strong>
                      Automatically generated
                    </strong>
                  </div>

                </div>

              </div>


              {/* =================================================
                  WARNING
                  ================================================= */}

              <div
                style={{
                  padding: 12,
                  background: surfaceStyles.warningBg,
                  border: `1px solid ${surfaceStyles.warningBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >

                Publishing this request will make it available
                in the public community requests section.

                <br />

                The original user request will be marked as
                <strong>
                  {' '}published
                </strong>.

              </div>

            </div>

          )}

        </Modal>

      </div>

    </ConfigProvider>

  );
};


export default UserRequestsAdmin;