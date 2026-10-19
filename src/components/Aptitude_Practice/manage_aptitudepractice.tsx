import React, { useEffect, useState } from 'react';
import {
  Select,
  Button,
  Table,
  message,
  Spin,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
} from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, set, get, remove } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;
const { TextArea } = Input;

const APTITUDE_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// Encrypt a plaintext string using AES.
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(APTITUDE_AES_SECRET_KEY);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return plainText;
  }
};

// Decrypt the AES‑encrypted string back to plaintext.
const decryptAES = (cipherText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(APTITUDE_AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(cipherText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return cipherText;
  }
};

// Recursively build a simple tree structure from Firebase data.
const buildTreeOptions = (obj: any): any[] => {
  const options: any[] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (typeof val === 'object' && val !== null && !('question' in val)) {
        options.push({
          key,
          label: key,
          children: buildTreeOptions(val),
        });
      }
    }
  }
  return options;
};

// Given the tree and the selected path, return the options for the given level.
const getOptionsForLevel = (tree: any[], level: number, selectedPath: string[]) => {
  if (level === 1) return tree;
  let currentNodes = tree;
  for (let i = 0; i < level - 1; i++) {
    const sel = selectedPath[i];
    const found = currentNodes.find((n: any) => n.key === sel);
    if (!found || !found.children) return [];
    currentNodes = found.children;
  }
  return currentNodes;
};

const FIXED_LEVELS = 4;

// Reusable Question Form (used in the Edit Modal).
const QuestionForm = ({
  form,
  onFinish,
  submitText = 'Update Question',
}: {
  form: any;
  onFinish: (values: any) => void;
  submitText?: string;
}) => (
  <Form form={form} layout="vertical" onFinish={onFinish}>
    <Form.Item
      label="Question"
      name="question"
      rules={[{ required: true, message: 'Please enter the question' }]}
    >
      <TextArea rows={3} placeholder="Enter the question" />
    </Form.Item>
    <Form.Item
      label="Options (comma separated)"
      name="options"
      rules={[{ required: true, message: 'Please enter options' }]}
    >
      <TextArea rows={2} placeholder="e.g. 12, 15, 27, 30" />
    </Form.Item>
    <Form.Item
      label="Category"
      name="aptCategory"
      rules={[{ required: true, message: 'Please enter the category' }]}
    >
      <Input placeholder="Enter aptitude category" />
    </Form.Item>
    <Form.Item
      label="Correct Answer"
      name="correct_answer"
      rules={[{ required: true, message: 'Please enter the correct answer' }]}
    >
      <Input placeholder="Enter the correct answer" />
    </Form.Item>
    <Form.Item
      label="Explanation"
      name="explanation"
      rules={[{ required: true, message: 'Please enter explanation' }]}
    >
      <TextArea rows={3} placeholder="Enter explanation" />
    </Form.Item>
    <Form.Item
      label="Time Limit (seconds)"
      name="time_limit"
      rules={[{ required: true, message: 'Please enter the time limit' }]}
    >
      <InputNumber min={1} style={{ width: '100%' }} placeholder="Enter time limit" />
    </Form.Item>
    <Form.Item>
      <Button type="primary" htmlType="submit">
        {submitText}
      </Button>
    </Form.Item>
  </Form>
);

const ManageAptitudePractice: React.FC = () => {
  // States for branch selection via the tree (4 dropdowns).
  const [treeOptions, setTreeOptions] = useState<any[]>([]);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [treeLoading, setTreeLoading] = useState<boolean>(true);

  // Table data and loading state.
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableLoading, setTableLoading] = useState<boolean>(false);

  // Edit modal state.
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState<boolean>(false);

  // On mount, load the Firebase tree.
  useEffect(() => {
    const aptitudeRef = dbRef(db, 'version12/Placement/Aptitude_Practice');
    const unsubscribe = onValue(aptitudeRef, (snapshot) => {
      const data = snapshot.val();
      setTreeOptions(data ? buildTreeOptions(data) : []);
      setTreeLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // When a full branch is selected, load questions from that branch.
  useEffect(() => {
    if (selectedValues.length === FIXED_LEVELS) {
      setTableLoading(true);
      const path = `version12/Placement/Aptitude_Practice/${selectedValues.join('/')}`;
      const dataRef = dbRef(db, path);
      const unsubscribe = onValue(dataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const records = Object.entries(data).map(([id, record]: [string, any]) => ({
            id,
            ...record,
          }));
          const decryptedRecords = records.map((record) => ({
            ...record,
            question: decryptAES(record.question),
            correct_answer: decryptAES(record.correct_answer),
            explanation: decryptAES(record.explanation),
            // Decrypt each option and show as a comma‑separated string.
            options: (record.options || []).map((opt: string) => decryptAES(opt)).join(', '),
            aptCategory: decryptAES(record.category),
            time_limit: decryptAES(record.time_limit),
          }));
          setTableData(decryptedRecords);
        } else {
          setTableData([]);
        }
        setTableLoading(false);
      });
      return () => unsubscribe();
    } else {
      // Clear table data if branch is incomplete.
      setTableData([]);
    }
  }, [selectedValues]);

  // Handler for branch dropdown changes.
  const handleSelectChange = (level: number, value: string) => {
    setSelectedValues((prev) => {
      const newSelected = [...prev];
      newSelected[level - 1] = value;
      return newSelected.slice(0, level);
    });
  };

  // Render all dropdowns in a single horizontal line.
  const renderDropDowns = () => {
    const dropDowns = [];
    for (let level = 1; level <= FIXED_LEVELS; level++) {
      const options = getOptionsForLevel(treeOptions, level, selectedValues);
      if (!options || options.length === 0) break;
      dropDowns.push(
        <div key={level} className="flex items-center gap-2">
          <span className="font-medium">Level {level}:</span>
          <Select
            placeholder={`Select Level ${level}`}
            style={{ width: 200 }}
            value={selectedValues[level - 1] || undefined}
            onChange={(value) => handleSelectChange(level, value)}
            allowClear
          >
            {options.map((opt: any) => (
              <Option key={opt.key} value={opt.key}>
                {opt.label}
              </Option>
            ))}
          </Select>
        </div>
      );
    }
    return <div className="flex items-center gap-4">{dropDowns}</div>;
  };

  // Handle delete action.
  const handleDelete = async (id: string) => {
    try {
      const path = `version12/Placement/Aptitude_Practice/${selectedValues.join('/')}/${id}`;
      await remove(dbRef(db, path));
      message.success('Question deleted successfully');
    } catch (err) {
      message.error('Failed to delete question');
    }
  };

  // When clicking on the "Edit" button, fetch the record and open the modal.
  const handleEditClick = async (record: any) => {
    setEditLoading(true);
    const path = `version12/Placement/Aptitude_Practice/${selectedValues.join('/')}/${record.id}`;
    try {
      const snapshot = await get(dbRef(db, path));
      const data = snapshot.val();
      if (!data) {
        message.error('Failed to load question for editing.');
        return;
      }
      // Decrypt the fields for the edit form.
      const decryptedRecord = {
        question: decryptAES(data.question),
        correct_answer: decryptAES(data.correct_answer),
        explanation: decryptAES(data.explanation),
        options: (data.options || []).map((opt: string) => decryptAES(opt)).join(', '),
        aptCategory: decryptAES(data.category),
        time_limit: Number(decryptAES(data.time_limit)),
      };
      editForm.setFieldsValue(decryptedRecord);
      setEditingRecord({ id: data.id });
      setEditModalVisible(true);
    } catch (err) {
      console.error(err);
      message.error('Error fetching question data.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle form submission for editing.
  const handleEditSubmit = async (values: any) => {
    if (!editingRecord) return;
    const now = new Date().toLocaleDateString();
    const path = `version12/Placement/Aptitude_Practice/${selectedValues.join('/')}/${editingRecord.id}`;
    const updatedData = {
      id: editingRecord.id,
      question: encryptAES(values.question),
      correct_answer: encryptAES(values.correct_answer),
      explanation: encryptAES(values.explanation),
      options: values.options.split(',').map((o: string) => encryptAES(o.trim())),
      category: encryptAES(values.aptCategory),
      time_limit: encryptAES(values.time_limit.toString()),
      date: now,
    };
    try {
      await set(dbRef(db, path), updatedData);
      message.success('Question updated successfully!');
      setEditModalVisible(false);
      setEditingRecord(null);
      // Table auto‑updates due to onValue listener.
    } catch (error) {
      console.error(error);
      message.error('Failed to update question.');
    }
  };

  // Table column definitions.
  const columns = [
    {
      title: 'Question',
      dataIndex: 'question',
      key: 'question',
      render: (text: string) =>
        text.length > 50 ? `${text.substring(0, 50)}...` : text,
    },
    {
      title: 'Options',
      dataIndex: 'options',
      key: 'options',
      render: (text: string) =>
        text.length > 40 ? `${text.substring(0, 40)}...` : text,
    },
    { title: 'Category', dataIndex: 'aptCategory', key: 'aptCategory' },
    { title: 'Correct Answer', dataIndex: 'correct_answer', key: 'correct_answer' },
    { title: 'Explanation', dataIndex: 'explanation', key: 'explanation' },
    { title: 'Time Limit', dataIndex: 'time_limit', key: 'time_limit' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <div className="flex items-center gap-2">
          <Button icon={<EditOutlined />} onClick={() => handleEditClick(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Confirm delete?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger>
              <DeleteOutlined className="text-lg" />
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 bg-white min-h-[80vh]">
      
      {/* Branch Selection Dropdowns (all inline) */}
      <div className="mb-4">
        {treeLoading ? <Spin /> : renderDropDowns()}
      </div>
      
      {/* Selected Branch & Total Number */}
      <div className="mb-4 text-sm text-gray-700 flex justify-between items-center">
        <div>
          <strong>Selected Branch:</strong>{' '}
          {selectedValues.length ? selectedValues.join(' / ') : 'None'}
        </div>
        <div>
          <strong>Total:</strong> {tableData.length}
        </div>
      </div>
      
      {/* Questions Table */}
      {selectedValues.length === FIXED_LEVELS ? (
        <Spin spinning={tableLoading}>
          <Table columns={columns} dataSource={tableData} rowKey="id" pagination={{ pageSize: 8 }} />
        </Spin>
      ) : (
        <div className="text-center text-gray-500">
          <h3>Please complete all 4 levels to view questions.</h3>
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        title="Edit Question"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={() => {
          editForm
            .validateFields()
            .then((values) => {
              handleEditSubmit(values);
            })
            .catch(() => {});
        }}
        okText="Save"
        destroyOnClose
      >
        <Spin spinning={editLoading}>
          <QuestionForm form={editForm} onFinish={handleEditSubmit} submitText="Update Question" />
        </Spin>
      </Modal>
    </div>
  );
};

export default ManageAptitudePractice;
