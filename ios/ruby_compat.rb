unless [].respond_to?(:filter_map)
  module Enumerable
    def filter_map
      return to_enum(:filter_map) unless block_given?
      result = []
      each { |item| v = yield item; result << v if v }
      result
    end
  end
end
