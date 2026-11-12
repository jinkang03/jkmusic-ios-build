# Ruby 2.6 兼容层：Expo autolinking 脚本用到 Ruby 2.7+ 的 Enumerable#filter_map。
# 本机系统 Ruby 为 2.6.10，无法升级时用它补齐。
unless [].respond_to?(:filter_map)
  module Enumerable
    def filter_map
      return to_enum(:filter_map) unless block_given?

      result = []
      each do |item|
        value = yield item
        result << value if value
      end
      result
    end
  end
end

unless [].respond_to?(:tally)
  module Enumerable
    def tally
      result = Hash.new(0)
      each { |item| result[item] += 1 }
      result
    end
  end
end
