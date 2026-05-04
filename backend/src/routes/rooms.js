const { Router } = require('express');
const prisma = require('../db');

const router = Router();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post('/', async (req, res) => {
  try {
    let code;
    let attempts = 0;
    do {
      code = generateRoomCode();
      attempts++;
    } while (attempts < 10 && await prisma.room.findUnique({ where: { code } }));

    const room = await prisma.room.create({
      data: { code },
    });

    res.status(201).json({
      data: {
        code: room.code,
        language: room.language,
        content: room.content,
        createdAt: room.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:code', async (req, res) => {
  try {
    const room = await prisma.room.findUnique({
      where: { code: req.params.code.toUpperCase() },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      data: {
        code: room.code,
        language: room.language,
        content: room.content,
        updatedAt: room.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:code', async (req, res) => {
  try {
    const { language, content } = req.body;
    const updateData = {};
    if (language !== undefined) updateData.language = language;
    if (content !== undefined) updateData.content = content;

    const room = await prisma.room.update({
      where: { code: req.params.code.toUpperCase() },
      data: updateData,
    });

    res.json({
      data: {
        code: room.code,
        language: room.language,
        content: room.content,
        updatedAt: room.updatedAt,
      },
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
