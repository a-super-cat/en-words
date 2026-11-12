import type { Pair } from '../types';

export interface GuideStep {
  title: string;
  /** 45 分钟面试里大约花多久 */
  minutes: number;
  goal: string;
  phrases: Pair[];
}

/** 系统设计面试的讲解顺序和每一步的开场句型。句型里的 ... 换成题目里的具体内容。 */
export const DESIGN_GUIDE: GuideStep[] = [
  {
    title: '澄清需求',
    minutes: 5,
    goal: '先问清楚要做什么、不做什么。直接开始画图是最常见的失分点。',
    phrases: [
      { en: 'Before I jump into the design, let me clarify a few requirements.', zh: '在开始设计之前，我先确认几个需求。' },
      { en: 'Who are the users, and what are the core use cases?', zh: '用户是谁？核心使用场景是什么？' },
      { en: 'Is this read-heavy or write-heavy?', zh: '这是读多还是写多的系统？' },
      { en: "I'll treat that as out of scope for now, if that's okay.", zh: '如果可以的话，这部分我先不考虑。' },
    ],
  },
  {
    title: '估算规模',
    minutes: 5,
    goal: '用几个粗略的数字定下量级，后面的选型才有依据。',
    phrases: [
      { en: 'Let me do a quick back-of-the-envelope estimate.', zh: '我先粗略估算一下。' },
      { en: "Assuming ten million daily active users, that's roughly ... requests per second.", zh: '假设有一千万日活，大约是每秒……个请求。' },
      { en: "So we're looking at about ... of storage per year.", zh: '所以一年大约需要……的存储。' },
      { en: 'Peak traffic is probably three to five times the average.', zh: '峰值流量大概是平均值的三到五倍。' },
    ],
  },
  {
    title: '定义接口',
    minutes: 5,
    goal: '把系统对外的几个主要接口说清楚，等于和面试官对齐了功能范围。',
    phrases: [
      { en: 'Let me sketch out the main endpoints first.', zh: '我先把主要的接口列出来。' },
      { en: 'The client calls ... with ..., and gets back ...', zh: '客户端带着……调用……，拿到……' },
      { en: "I'd make this endpoint idempotent, so retries are safe.", zh: '我会把这个接口做成幂等的，这样重试是安全的。' },
    ],
  },
  {
    title: '数据模型',
    minutes: 5,
    goal: '说出核心实体、主要的访问方式，以及为什么选这种存储。',
    phrases: [
      { en: "For the data model, I'd start with these entities.", zh: '数据模型方面，我先从这几个实体开始。' },
      { en: "The main access pattern is lookups by ..., so I'd key it on ...", zh: '主要的访问方式是按……查找，所以我会用……做键。' },
      { en: "I'd go with a relational database here, because we need transactions.", zh: '这里我会选关系型数据库，因为我们需要事务。' },
    ],
  },
  {
    title: '整体架构',
    minutes: 15,
    goal: '顺着一个请求的路径讲。先讲完整的主流程，再回头补细节。',
    phrases: [
      { en: 'At a high level, the request flows like this.', zh: '从整体上看，请求是这样流转的。' },
      { en: 'Let me walk you through the write path first, then the read path.', zh: '我先讲写入路径，再讲读取路径。' },
      { en: "I'd put a load balancer in front of stateless application servers.", zh: '我会在无状态的应用服务器前面放一个负载均衡器。' },
      { en: "To take load off the database, I'd add a cache in front of it.", zh: '为了给数据库减压，我会在它前面加一层缓存。' },
    ],
  },
  {
    title: '瓶颈和取舍',
    minutes: 8,
    goal: '主动指出方案的弱点和代价。这是高级工程师和中级工程师拉开差距的地方。',
    phrases: [
      { en: 'The bottleneck would be ...', zh: '瓶颈会出现在……' },
      { en: 'The trade-off here is ...', zh: '这里的取舍是……' },
      { en: 'If traffic grew ten times, the first thing to break would be ...', zh: '如果流量涨十倍，最先撑不住的是……' },
      { en: "One thing I'd want to monitor closely is ...", zh: '有一个我会重点监控的指标是……' },
    ],
  },
  {
    title: '收尾',
    minutes: 2,
    goal: '用一两句话总结，再把话头交回给面试官。',
    phrases: [
      { en: 'To summarize, ...', zh: '总结一下，……' },
      { en: "If I had more time, I'd dig into ...", zh: '如果时间更多，我会深入看……' },
      { en: "Is there a particular area you'd like me to go deeper on?", zh: '有没有哪一块你希望我讲得更深入？' },
    ],
  },
];
