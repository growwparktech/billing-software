import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  seq: {
    type: Number,
    default: 0
  }
});

const Counter = mongoose.model('Counter', counterSchema);

// ✅ ATOMIC: Function to get next sequence number safely
export const getNextSequence = async (name) => {
  try {
    const result = await Counter.findByIdAndUpdate(
      name,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return result.seq;
  } catch (error) {
    console.error('❌ Error getting next sequence:', error);
    throw error;
  }
};

export default Counter;
