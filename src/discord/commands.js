import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";

export function buildCommands() {
  const claimByAssetId = new SlashCommandBuilder()
    .setName("claim-by-id")
    .setNameLocalizations({
      "zh-CN": "输入作品id获取",
    })
    .setDescription("通过作品ID领取受保护附件")
    .addStringOption((option) =>
      option
        .setName("asset_id")
        .setDescription("作品ID")
        .setRequired(true),
    );

  const deletePost = new SlashCommandBuilder()
    .setName("delete-post")
    .setNameLocalizations({
      "zh-CN": "删除帖子",
    })
    .setDescription("按帖子链接删除整帖")
    .addStringOption((option) =>
      option
        .setName("post_link")
        .setDescription("帖子链接（复制帖子消息链接）")
        .setRequired(true),
    );

  const top = new SlashCommandBuilder()
    .setName("top")
    .setNameLocalizations({
      "zh-CN": "回顶",
    })
    .setDescription("回到帖子首楼");

  const publishFromMessage = new ContextMenuCommandBuilder()
    .setName("发布此消息附件作为作品")
    .setType(ApplicationCommandType.Message);

  return [claimByAssetId, deletePost, top, publishFromMessage];
}
