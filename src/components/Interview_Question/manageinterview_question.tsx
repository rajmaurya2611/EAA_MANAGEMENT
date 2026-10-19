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
import {
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, get, update, remove } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;
const INTERVIEW_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// AES decryption/encryption
const decryptAES = (text: string) => {
  try {
    const key = CryptoJS.enc.Utf8.parse(INTERVIEW_AES_SECRET_KEY);
    return CryptoJS.AES.decrypt(text, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })
      .toString(CryptoJS.enc.Utf8);
  } catch {
    return text;
  }
};
const encryptAES = (plain: string) => {
  try {
    const key = CryptoJS.enc.Utf8.parse(INTERVIEW_AES_SECRET_KEY);
    return CryptoJS.AES.encrypt(plain, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plain;
  }
};

const ManageInterviewQuestions: React.FC = () => {
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [viewAnswerModalVisible, setViewAnswerModalVisible] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editForm] = Form.useForm();

  const [searchText, setSearchText] = useState('');

  // Load categories
  useEffect(() => {
    const ref = dbRef(db, 'version12/Placement/Interview_Questions');
    onValue(ref, snap => {
      const data = snap.val() || {};
      setCategories(Object.keys(data));
    });
  }, []);

  // Load questions
  useEffect(() => {
    if (!selectedCategory) return;
    setLoading(true);
    const ref = dbRef(db, `version12/Placement/Interview_Questions/${selectedCategory}`);
    onValue(ref, snap => {
      const data = snap.val() || {};
      const qs = Object.values(data).map((item: any) => ({
        key: item.id,
        id: item.id,
        question: decryptAES(item.question),
        answer: decryptAES(item.answer),
        difficulty: decryptAES(item.difficulty),
        topic: decryptAES(item.topic),
        category: decryptAES(item.category),
        views: item.views,
        date: item.date,
      }));
      setQuestions(qs);
      setLoading(false);
    });
  }, [selectedCategory]);

  const handleViewAnswer = (rec: any) => {
    setCurrentAnswer(rec.answer);
    setViewAnswerModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(
        dbRef(db, `version12/Placement/Interview_Questions/${selectedCategory}/${id}`)
      );
      message.success('Deleted');
    } catch {
      message.error('Delete failed');
    }
  };

  const handleEdit = async (rec: any) => {
    setEditLoading(true);
    try {
      const snap = await get(
        dbRef(db, `version12/Placement/Interview_Questions/${selectedCategory}/${rec.id}`)
      );
      const d = snap.val();
      if (!d) throw new Error();
      editForm.setFieldsValue({
        question: decryptAES(d.question),
        answer: decryptAES(d.answer),
        difficulty: decryptAES(d.difficulty),
        topic: decryptAES(d.topic),
        category: decryptAES(d.category),
        views: d.views,
      });
      setEditingQuestionId(d.id);
      setEditModalVisible(true);
    } catch {
      message.error('Load failed');
    } finally {
      setEditLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const vals = await editForm.validateFields();
      if (!editingQuestionId) return;
      const path = `version12/Placement/Interview_Questions/${selectedCategory}/${editingQuestionId}`;
      await update(dbRef(db, path), {
        id: editingQuestionId,
        question: encryptAES(vals.question),
        answer: encryptAES(vals.answer),
        difficulty: encryptAES(vals.difficulty),
        topic: encryptAES(vals.topic),
        category: encryptAES(vals.category),
        views: vals.views,
        date: new Date().toLocaleDateString(),
      });
      message.success('Updated');
      setEditModalVisible(false);
    } catch {
      message.error('Update failed');
    }
  };

  const filtered = questions.filter(q => {
    const s = searchText.toLowerCase();
    return (
      q.question.toLowerCase().includes(s) ||
      q.topic.toLowerCase().includes(s)
    );
  });

  const columns = [
    { title: 'Question', dataIndex: 'question', key: 'question', render: (t:string) => t.length>50 ? `${t.slice(0,50)}…` : t },
    { title: 'Topic', dataIndex: 'topic', key: 'topic' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Difficulty', dataIndex: 'difficulty', key: 'difficulty' },
    { title: 'Views', dataIndex: 'views', key: 'views' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_:any, rec:any) => (
        <div style={{ display:'flex', gap:8 }}>
          <Button icon={<EyeOutlined />} onClick={()=>handleViewAnswer(rec)}>View Answer</Button>
          <Button icon={<EditOutlined />} onClick={()=>handleEdit(rec)}>Edit</Button>
          <Popconfirm
            title="Delete?"
            onConfirm={()=>handleDelete(rec.id)}
            okText="Yes" cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding:24, background:'#fff', minHeight:'80vh' }}>

      <div style={{ display:'flex', justifyContent:'space-between', margin:'16px 0' }}>
        <Select
          placeholder="Select Category"
          style={{ width:200 }}
          value={selectedCategory || undefined}
          onChange={val=>setSelectedCategory(val)}
        >
          {categories.map(cat=>(
            <Option key={cat} value={cat}>{cat}</Option>
          ))}
        </Select>

        <Input
          placeholder="Search Question / Topic"
          prefix={<SearchOutlined />}
          style={{ width:300 }}
          value={searchText}
          onChange={e=>setSearchText(e.target.value)}
        />
      </div>

      <div style={{ marginBottom:16 }}>
        <strong>Selected:</strong> {selectedCategory||'None'} &nbsp;|&nbsp;
        <strong>Total:</strong> {filtered.length}
      </div>

      <Spin spinning={loading}>
        <Table columns={columns} dataSource={filtered} pagination={{ pageSize:8 }} />
      </Spin>

      {/* View Answer */}
      <Modal
        title="Answer"
        open={viewAnswerModalVisible}
        onCancel={()=>setViewAnswerModalVisible(false)}
        footer={[<Button onClick={()=>setViewAnswerModalVisible(false)} type="primary">OK</Button>]}
      >
        <p>{currentAnswer}</p>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit Interview Question"
        open={editModalVisible}
        onCancel={()=>setEditModalVisible(false)}
        onOk={handleUpdate}
        okText="Save"
        destroyOnClose
      >
        <Spin spinning={editLoading}>
          <Form form={editForm} layout="vertical">
            <Form.Item
              label="Question"
              name="question"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>

            <Form.Item
              label="Answer"
              name="answer"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input.TextArea rows={4} />
            </Form.Item>

            <Form.Item
              label="Difficulty"
              name="difficulty"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select>
                <Option value="1">1</Option>
                <Option value="2">2</Option>
                <Option value="3">3</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Category"
              name="category"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select>
                <Option value="HR">HR</Option>
                <Option value="Technical">Technical</Option>
                <Option value="Aptitude">Aptitude</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Topic"
              name="topic"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              label="Views"
              name="views"
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};

export default ManageInterviewQuestions;


// import React, { useEffect, useState } from 'react';
// import {
//   Select,
//   Button,
//   Table,
//   message,
//   Spin,
//   Modal,
//   Form,
//   Input,
//   Popconfirm,
// } from 'antd';
// import {
//   DeleteOutlined,
//   EditOutlined,
//   SearchOutlined,
//   EyeOutlined,
// } from '@ant-design/icons';
// import { db } from '../../firebaseConfig';
// import { ref as dbRef, onValue, update, remove, get } from 'firebase/database';
// import CryptoJS from 'crypto-js';

// const { Option } = Select;

// const ROADMAPS_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// const decryptAES = (encryptedText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(ROADMAPS_AES_SECRET_KEY);
//     const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return decrypted.toString(CryptoJS.enc.Utf8);
//   } catch (error) {
//     console.error('Decryption failed:', error);
//     return encryptedText;
//   }
// };

// const encryptAES = (plainText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(ROADMAPS_AES_SECRET_KEY);
//     const encrypted = CryptoJS.AES.encrypt(plainText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return encrypted.toString();
//   } catch (error) {
//     console.error('Encryption failed:', error);
//     return plainText;
//   }
// };

// const ManageInterviewQuestions: React.FC = () => {
//   const [selectedCategory, setSelectedCategory] = useState<string>('');
//   const [categories, setCategories] = useState<string[]>([]);
//   const [questions, setQuestions] = useState<any[]>([]);
//   const [loading, setLoading] = useState<boolean>(false);
//   const [editModalVisible, setEditModalVisible] = useState(false);
//   const [editingQuestion, setEditingQuestion] = useState<any>(null);
//   const [editForm] = Form.useForm();
//   const [searchText, setSearchText] = useState('');
//   const [editLoading, setEditLoading] = useState(false);

//   // New state for viewing answer
//   const [viewAnswerModalVisible, setViewAnswerModalVisible] = useState(false);
//   const [currentAnswer, setCurrentAnswer] = useState('');

//   // Fetch categories from Interview_Questions node
//   useEffect(() => {
//     const interviewRef = dbRef(db, 'version12/Placement/Interview_Questions');
//     onValue(interviewRef, (snapshot) => {
//       const data = snapshot.val();
//       setCategories(data ? Object.keys(data) : []);
//     });
//   }, []);

//   // Fetch questions when selected category changes
//   useEffect(() => {
//     if (selectedCategory) {
//       fetchQuestions();
//     }
//   }, [selectedCategory]);

//   const fetchQuestions = () => {
//     if (!selectedCategory) return;
//     setLoading(true);
//     const categoryRef = dbRef(
//       db,
//       `version12/Placement/Interview_Questions/${selectedCategory}`
//     );
//     onValue(categoryRef, (snapshot) => {
//       const data = snapshot.val();
//       const questionList = data
//         ? Object.values(data).map((item: any) => ({
//             key: item.id,
//             id: item.id,
//             question: decryptAES(item.question),
//             answer: decryptAES(item.answer),
//             difficulty: item.difficulty,
//             topic: item.topic,
//             views: item.views,
//             date: item.date,
//           }))
//         : [];
//       setQuestions(questionList);
//       setLoading(false);
//     });
//   };

//   // Delay opening edit modal until data is fetched and form is populated.
//   const handleEdit = async (record: any) => {
//     setEditLoading(true);
//     const path = `version12/Placement/Interview_Questions/${selectedCategory}/${record.id}`;
//     try {
//       const snapshot = await get(dbRef(db, path));
//       const data = snapshot.val();
//       if (!data) {
//         message.error('Failed to load interview question for editing.');
//         return;
//       }
//       const decryptedRecord = {
//         question: decryptAES(data.question),
//         answer: decryptAES(data.answer),
//         difficulty: data.difficulty,
//         topic: data.topic,
//       };
//       editForm.setFieldsValue(decryptedRecord);
//       setEditingQuestion({ id: data.id });
//       setEditModalVisible(true);
//     } catch (err) {
//       console.error(err);
//       message.error('Error fetching interview question data.');
//     } finally {
//       setEditLoading(false);
//     }
//   };

//   const handleUpdate = async () => {
//     try {
//       const values = await editForm.validateFields();
//       const path = `version12/Placement/Interview_Questions/${selectedCategory}/${editingQuestion.id}`;
//       const updatedData = {
//         id: editingQuestion.id,
//         date: new Date().toLocaleDateString(),
//         question: encryptAES(values.question),
//         answer: encryptAES(values.answer),
//         difficulty: values.difficulty,
//         topic: values.topic,
//       };
//       await update(dbRef(db, path), updatedData);
//       message.success('Interview question updated successfully');
//       setEditModalVisible(false);
//       fetchQuestions();
//     } catch (err) {
//       message.error('Failed to update interview question');
//     }
//   };

//   const handleDelete = async (id: string) => {
//     try {
//       await remove(
//         dbRef(db, `version12/Placement/Interview_Questions/${selectedCategory}/${id}`)
//       );
//       message.success('Interview question deleted successfully');
//       fetchQuestions();
//     } catch (err) {
//       message.error('Failed to delete interview question');
//     }
//   };

//   // Handle View Answer: set current answer and open modal.
//   const handleViewAnswer = (record: any) => {
//     setCurrentAnswer(record.answer);
//     setViewAnswerModalVisible(true);
//   };

//   // Filter questions based on search text.
//   const filteredQuestions = questions.filter((q) => {
//     const s = searchText.toLowerCase();
//     return (
//       q.question.toLowerCase().includes(s) ||
//       q.topic.toLowerCase().includes(s)
//     );
//   });

//   const columns = [
//     {
//       title: 'Question',
//       dataIndex: 'question',
//       key: 'question',
//       render: (text: string) =>
//         text.length > 50 ? `${text.substring(0, 50)}...` : text,
//     },
//     { title: 'Topic', dataIndex: 'topic', key: 'topic' },
//     { title: 'Difficulty', dataIndex: 'difficulty', key: 'difficulty' },
//     { title: 'Views', dataIndex: 'views', key: 'views' },
//     { title: 'Date', dataIndex: 'date', key: 'date' },
//     {
//       title: 'Actions',
//       key: 'actions',
//       render: (_: any, record: any) => (
//         <div className="flex gap-2">
//           <Button icon={<EyeOutlined />} onClick={() => handleViewAnswer(record)}>
//             View Answer
//           </Button>
//           <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
//             Edit
//           </Button>
//           <Popconfirm
//             title="Confirm delete?"
//             onConfirm={() => handleDelete(record.id)}
//             okText="Yes"
//             cancelText="No"
//           >
//             <Button type="link" danger>
//              <DeleteOutlined className="text-lg " />
//             </Button>
//           </Popconfirm>
//         </div>
//       ),
//     },
//   ];

//   return (
//     <div className="p-6 bg-white min-h-[80vh]">
//       <h2 className="text-xl font-bold mb-4">Manage Interview Questions</h2>

//       {/* Filter and Search in same line (opposite ends) */}
//       <div className="flex justify-between items-center mb-4">
//         <div className="flex gap-4 items-center">
//           <Select
//             placeholder="Select Category"
//             style={{ width: 200 }}
//             value={selectedCategory || undefined}
//             onChange={(val) => {
//               setSelectedCategory(val);
//               setQuestions([]);
//             }}
//           >
//             {categories.map((cat) => (
//               <Option key={cat} value={cat}>
//                 {cat}
//               </Option>
//             ))}
//           </Select>
//         </div>
//         <Input
//           placeholder="Search Question / Topic"
//           prefix={<SearchOutlined />}
//           value={searchText}
//           onChange={(e) => setSearchText(e.target.value)}
//           style={{ width: 300 }}
//         />
//       </div>

//       {/* Selected Filters and Total in a row (opposite ends) */}
//       <div className="mb-4 text-sm text-gray-700 flex justify-between items-center">
//         <div>
//           <strong>Selected Filters:</strong> Category: {selectedCategory || 'None'}
//         </div>
//         <div>
//           <strong>Total:</strong> {filteredQuestions.length}
//         </div>
//       </div>

//       <Spin spinning={loading}>
//         <Table
//           columns={columns}
//           dataSource={filteredQuestions}
//           pagination={{ pageSize: 8 }}
//         />
//       </Spin>

//       {/* Modal for Editing */}
//       <Modal
//         title="Edit Interview Question"
//         open={editModalVisible}
//         onCancel={() => setEditModalVisible(false)}
//         onOk={handleUpdate}
//         okText="Save"
//         destroyOnClose
//       >
//         <Spin spinning={editLoading}>
//           <Form form={editForm} layout="vertical">
//             <Form.Item
//               label="Question"
//               name="question"
//               rules={[{ required: true, message: 'Question is required' }]}
//             >
//               <Input.TextArea rows={3} />
//             </Form.Item>
//             <Form.Item
//               label="Answer"
//               name="answer"
//               rules={[{ required: true, message: 'Answer is required' }]}
//             >
//               <Input.TextArea rows={4} />
//             </Form.Item>
//             <Form.Item
//               label="Difficulty"
//               name="difficulty"
//               rules={[{ required: true, message: 'Difficulty is required' }]}
//             >
//               <Select>
//                 <Option value="1">1</Option>
//                 <Option value="2">2</Option>
//                 <Option value="3">3</Option>
//               </Select>
//             </Form.Item>
//             <Form.Item
//               label="Topic"
//               name="topic"
//               rules={[{ required: true, message: 'Topic is required' }]}
//             >
//               <Input />
//             </Form.Item>
//           </Form>
//         </Spin>
//       </Modal>

//       {/* Modal for Viewing Answer */}
//       <Modal
//         title="Answer"
//         open={viewAnswerModalVisible}
//         onCancel={() => setViewAnswerModalVisible(false)}
//         footer={[
//           <Button key="ok" type="primary" onClick={() => setViewAnswerModalVisible(false)}>
//             OK
//           </Button>,
//         ]}
//       >
//         <p>{currentAnswer}</p>
//       </Modal>
//     </div>
//   );
// };

// export default ManageInterviewQuestions;
