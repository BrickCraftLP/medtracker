import { useData } from '../context/DataContext.jsx'

export function useTopics() {
  const { topics, upsertTopic, removeTopic } = useData()

  async function createTopic(topicData) {
    return upsertTopic({
      id: crypto.randomUUID(),
      ...topicData,
    })
  }

  async function updateTopic(topicId, changes) {
    const existing = topics.find(t => t.id === topicId)
    if (!existing) throw new Error('Topic not found')
    return upsertTopic({ ...existing, ...changes })
  }

  return { topics, createTopic, updateTopic, deleteTopic: removeTopic }
}
