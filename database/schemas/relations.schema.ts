import { relations } from 'drizzle-orm';
import { properties } from './properties.schema';
import { companies, companyMsas } from './companies.schema';
import { msas } from './msas.schema';
import { users } from './users.schema';
import {
    categories,
    vendors,
    vendorCategories,
    posts,
    postCategories,
    postImages,
    postLikes,
    postComments,
    postVendorTags,
    postUserTags,
} from './vendors.schema';
import {
    addresses,
    structures,
    assessments,
    exemptions,
    parcels,
    schoolDistricts,
    taxRecords,
    valuations,
    preForeclosures,
    lastSales,
    currentSales,
    propertyTransactions,
} from './properties.schema';
import {
    channels,
    channelMembers,
    messages,
    messageAttachments,
    messageReactions,
    messageMentions,
    pinnedMessages,
    notifications,
} from './mastermind.schema';

export const propertiesRelations = relations(properties, ({ one, many }) => ({
    address: one(addresses, {
        fields: [properties.id],
        references: [addresses.propertyId],
    }),
    structure: one(structures, {
        fields: [properties.id],
        references: [structures.propertyId],
    }),
    exemptions: one(exemptions, {
        fields: [properties.id],
        references: [exemptions.propertyId],
    }),
    parcel: one(parcels, {
        fields: [properties.id],
        references: [parcels.propertyId],
    }),
    schoolDistrict: one(schoolDistricts, {
        fields: [properties.id],
        references: [schoolDistricts.propertyId],
    }),
    preForeclosure: one(preForeclosures, {
        fields: [properties.id],
        references: [preForeclosures.propertyId],
    }),
    lastSale: one(lastSales, {
        fields: [properties.id],
        references: [lastSales.propertyId],
    }),
    currentSale: one(currentSales, {
        fields: [properties.id],
        references: [currentSales.propertyId],
    }),
    assessments: many(assessments),
    taxRecords: many(taxRecords),
    valuations: many(valuations),
    transactions: many(propertyTransactions),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
    transactionsAsBuyer: many(propertyTransactions, { relationName: 'transactionBuyer' }),
    transactionsAsSeller: many(propertyTransactions, { relationName: 'transactionSeller' }),
    companyMsas: many(companyMsas),
}));

export const companyMsasRelations = relations(companyMsas, ({ one }) => ({
    company: one(companies, {
        fields: [companyMsas.companyId],
        references: [companies.id],
    }),
    msa: one(msas, {
        fields: [companyMsas.msaId],
        references: [msas.id],
    }),
}));

export const msasRelations = relations(msas, ({ many }) => ({
    companyMsas: many(companyMsas),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
    property: one(properties, {
        fields: [addresses.propertyId],
        references: [properties.id],
    }),
}));

export const structuresRelations = relations(structures, ({ one }) => ({
    property: one(properties, {
        fields: [structures.propertyId],
        references: [properties.id],
    }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
    property: one(properties, {
        fields: [assessments.propertyId],
        references: [properties.id],
    }),
}));

export const exemptionsRelations = relations(exemptions, ({ one }) => ({
    property: one(properties, {
        fields: [exemptions.propertyId],
        references: [properties.id],
    }),
}));

export const parcelsRelations = relations(parcels, ({ one }) => ({
    property: one(properties, {
        fields: [parcels.propertyId],
        references: [properties.id],
    }),
}));

export const schoolDistrictsRelations = relations(schoolDistricts, ({ one }) => ({
    property: one(properties, {
        fields: [schoolDistricts.propertyId],
        references: [properties.id],
    }),
}));

export const taxRecordsRelations = relations(taxRecords, ({ one }) => ({
    property: one(properties, {
        fields: [taxRecords.propertyId],
        references: [properties.id],
    }),
}));

export const valuationsRelations = relations(valuations, ({ one }) => ({
    property: one(properties, {
        fields: [valuations.propertyId],
        references: [properties.id],
    }),
}));

export const preForeclosuresRelations = relations(preForeclosures, ({ one }) => ({
    property: one(properties, {
        fields: [preForeclosures.propertyId],
        references: [properties.id],
    }),
}));

export const lastSalesRelations = relations(lastSales, ({ one }) => ({
    property: one(properties, {
        fields: [lastSales.propertyId],
        references: [properties.id],
    }),
}));

export const currentSalesRelations = relations(currentSales, ({ one }) => ({
    property: one(properties, {
        fields: [currentSales.propertyId],
        references: [properties.id],
    }),
}));

export const propertyTransactionsRelations = relations(propertyTransactions, ({ one }) => ({
    property: one(properties, {
        fields: [propertyTransactions.propertyId],
        references: [properties.id],
    }),
    buyer: one(companies, {
        fields: [propertyTransactions.buyerId],
        references: [companies.id],
        relationName: 'transactionBuyer',
    }),
    seller: one(companies, {
        fields: [propertyTransactions.sellerId],
        references: [companies.id],
        relationName: 'transactionSeller',
    }),
}));

// ─── Community Relations ───────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts),
    postLikes: many(postLikes),
    postComments: many(postComments),
    postUserTags: many(postUserTags),
    vendors: many(vendors),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
    vendorCategories: many(vendorCategories),
    postCategories: many(postCategories),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
    user: one(users, {
        fields: [vendors.userId],
        references: [users.id],
    }),
    vendorCategories: many(vendorCategories),
    postVendorTags: many(postVendorTags),
}));

export const vendorCategoriesRelations = relations(vendorCategories, ({ one }) => ({
    vendor: one(vendors, {
        fields: [vendorCategories.vendorId],
        references: [vendors.id],
    }),
    category: one(categories, {
        fields: [vendorCategories.categoryId],
        references: [categories.id],
    }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
    user: one(users, {
        fields: [posts.userId],
        references: [users.id],
    }),
    postCategories: many(postCategories),
    postImages: many(postImages),
    postLikes: many(postLikes),
    postComments: many(postComments),
    postVendorTags: many(postVendorTags),
    postUserTags: many(postUserTags),
}));

export const postCategoriesRelations = relations(postCategories, ({ one }) => ({
    post: one(posts, {
        fields: [postCategories.postId],
        references: [posts.id],
    }),
    category: one(categories, {
        fields: [postCategories.categoryId],
        references: [categories.id],
    }),
}));

export const postImagesRelations = relations(postImages, ({ one }) => ({
    post: one(posts, {
        fields: [postImages.postId],
        references: [posts.id],
    }),
}));

export const postLikesRelations = relations(postLikes, ({ one }) => ({
    user: one(users, {
        fields: [postLikes.userId],
        references: [users.id],
    }),
    post: one(posts, {
        fields: [postLikes.postId],
        references: [posts.id],
    }),
}));

export const postCommentsRelations = relations(postComments, ({ one, many }) => ({
    post: one(posts, {
        fields: [postComments.postId],
        references: [posts.id],
    }),
    user: one(users, {
        fields: [postComments.userId],
        references: [users.id],
    }),
    parentComment: one(postComments, {
        fields: [postComments.parentCommentId],
        references: [postComments.id],
        relationName: 'commentReplies',
    }),
    replies: many(postComments, { relationName: 'commentReplies' }),
}));

export const postVendorTagsRelations = relations(postVendorTags, ({ one }) => ({
    post: one(posts, {
        fields: [postVendorTags.postId],
        references: [posts.id],
    }),
    vendor: one(vendors, {
        fields: [postVendorTags.vendorId],
        references: [vendors.id],
    }),
}));

export const postUserTagsRelations = relations(postUserTags, ({ one }) => ({
    post: one(posts, {
        fields: [postUserTags.postId],
        references: [posts.id],
    }),
    taggedUser: one(users, {
        fields: [postUserTags.taggedUserId],
        references: [users.id],
    }),
}));

// ─── Mastermind Relations ───────────────────────────────────────────────────────

export const channelsRelations = relations(channels, ({ one, many }) => ({
    creator: one(users, {
        fields: [channels.createdBy],
        references: [users.id],
    }),
    members: many(channelMembers),
    messages: many(messages),
    pin: one(pinnedMessages),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
    channel: one(channels, {
        fields: [channelMembers.channelId],
        references: [channels.id],
    }),
    user: one(users, {
        fields: [channelMembers.userId],
        references: [users.id],
    }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
    channel: one(channels, {
        fields: [messages.channelId],
        references: [channels.id],
    }),
    sender: one(users, {
        fields: [messages.senderId],
        references: [users.id],
    }),
    parent: one(messages, {
        fields: [messages.parentMessageId],
        references: [messages.id],
        relationName: 'messageReplies',
    }),
    replies: many(messages, { relationName: 'messageReplies' }),
    attachments: many(messageAttachments),
    reactions: many(messageReactions),
    mentions: many(messageMentions),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
    message: one(messages, {
        fields: [messageAttachments.messageId],
        references: [messages.id],
    }),
}));

export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
    message: one(messages, {
        fields: [messageReactions.messageId],
        references: [messages.id],
    }),
    user: one(users, {
        fields: [messageReactions.userId],
        references: [users.id],
    }),
}));

export const messageMentionsRelations = relations(messageMentions, ({ one }) => ({
    message: one(messages, {
        fields: [messageMentions.messageId],
        references: [messages.id],
    }),
    mentionedUser: one(users, {
        fields: [messageMentions.mentionedUserId],
        references: [users.id],
    }),
}));

export const pinnedMessagesRelations = relations(pinnedMessages, ({ one }) => ({
    channel: one(channels, {
        fields: [pinnedMessages.channelId],
        references: [channels.id],
    }),
    message: one(messages, {
        fields: [pinnedMessages.messageId],
        references: [messages.id],
    }),
    pinnedByUser: one(users, {
        fields: [pinnedMessages.pinnedBy],
        references: [users.id],
    }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
    recipient: one(users, {
        fields: [notifications.userId],
        references: [users.id],
        relationName: 'notificationRecipient',
    }),
    actor: one(users, {
        fields: [notifications.actorId],
        references: [users.id],
        relationName: 'notificationActor',
    }),
    channel: one(channels, {
        fields: [notifications.channelId],
        references: [channels.id],
    }),
    message: one(messages, {
        fields: [notifications.messageId],
        references: [messages.id],
    }),
}));
